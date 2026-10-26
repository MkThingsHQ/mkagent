import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveSession } from '../../../shared/src/sessions/storage.ts'
import { SessionManager, createManagedSession } from './SessionManager.ts'

// "Continue in a new session" (Coding mode switch): the summary of the earlier conversation is a
// model call that takes seconds, so the new session opens at once and gets the summary in the
// background; its first turn waits for it (bounded).
describe('handoff summary in the background', () => {
  let tmpRoot: string
  let sm: SessionManager
  const workspace = () => ({ id: 'ws-test', name: 'Test Workspace', rootPath: tmpRoot, createdAt: Date.now() })
  const sessions = () => (sm as unknown as { sessions: Map<string, ReturnType<typeof createManagedSession>> }).sessions

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'sm-handoff-summary-'))
    sm = new SessionManager()
    sm.setEventSink(() => {})
  })

  afterEach(() => {
    sm.cleanup()
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: Error) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }

  /** A session whose fake agent records the summary it would read when its turn runs. */
  async function sessionWithAgent(id: string) {
    const managed = createManagedSession({ id, name: 'handoff test' }, workspace() as never, { messagesLoaded: true })
    sessions().set(id, managed)
    await saveSession({ id, workspaceRootPath: tmpRoot, createdAt: 1, lastUsedAt: 1, messages: [], tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextTokens: 0, costUsd: 0 } } as any)
    const turns: Array<{ message: string; summary?: string }> = []
    ;(sm as any).getOrCreateAgent = async () => ({
      getModel: () => 'claude-sonnet-4-6',
      setAllSources: () => {},
      getSessionId: () => 'sdk-session',
      // BaseAgent.chat reads the summary through getTransferredSessionSummary while the turn runs
      chat: async function* (message: string) {
        turns.push({ message, summary: managed.transferredSessionSummaryApplied ? undefined : managed.transferredSessionSummary })
        yield { type: 'complete' }
      },
    })
    return { managed, turns }
  }

  it('continues in a new session at once and attaches the summary when it is ready', async () => {
    const source = createManagedSession({ id: 'source', name: 'source' }, workspace() as never, { messagesLoaded: true })
    sessions().set('source', source)
    const target = createManagedSession({ id: 'target', name: 'target' }, workspace() as never, { messagesLoaded: true })
    ;(sm as any).createSession = async () => { sessions().set('target', target); return { id: 'target' } }
    const summary = deferred<string | null>()
    ;(sm as any).generateSessionHandoffSummary = () => summary.promise

    expect(await sm.continueSessionInNewSession('source', true)).toEqual({ sessionId: 'target' })
    const pending = target.pendingHandoffSummary
    expect(pending).toBeDefined()
    expect(target.transferredSessionSummary).toBeUndefined()

    summary.resolve('The user is adding a recursive repo scan.')
    await pending
    expect(target.transferredSessionSummary).toBe('The user is adding a recursive repo scan.')
    expect(target.transferredSessionSummaryApplied).toBe(false)
    expect(target.pendingHandoffSummary).toBeUndefined()
  })

  it('starts the new session without a summary when generating one fails', async () => {
    const source = createManagedSession({ id: 'source', name: 'source' }, workspace() as never, { messagesLoaded: true })
    sessions().set('source', source)
    const target = createManagedSession({ id: 'target', name: 'target' }, workspace() as never, { messagesLoaded: true })
    ;(sm as any).createSession = async () => { sessions().set('target', target); return { id: 'target' } }
    ;(sm as any).generateSessionHandoffSummary = async () => { throw new Error('mini model unavailable') }

    await sm.continueSessionInNewSession('source', true)
    await target.pendingHandoffSummary
    expect(target.transferredSessionSummary).toBeUndefined()
    expect(target.pendingHandoffSummary).toBeUndefined()
  })

  it('makes the first turn wait for a summary that is still being generated', async () => {
    const { managed, turns } = await sessionWithAgent('continued')
    const summary = deferred<void>()
    managed.pendingHandoffSummary = summary.promise.then(() => { managed.transferredSessionSummary = 'Earlier: picked the scan roots.' })

    const sending = sm.sendMessage(managed.id, 'carry on')
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(turns).toHaveLength(0)

    summary.resolve()
    await sending
    expect(turns).toEqual([{ message: 'carry on', summary: 'Earlier: picked the scan roots.' }])
  })

  it('starts the first turn without the summary after the wait limit', async () => {
    const { managed, turns } = await sessionWithAgent('slow-summary')
    ;(sm as any).handoffSummaryWaitMs = 20
    managed.pendingHandoffSummary = new Promise<void>(() => {})

    await sm.sendMessage(managed.id, 'carry on')
    expect(turns).toEqual([{ message: 'carry on', summary: undefined }])
  })
  it('queues a second message while the first awaits the summary and delivers in order once', async () => {
    const { managed, turns } = await sessionWithAgent('ordered');
    const summary = deferred<void>(); managed.pendingHandoffSummary = summary.promise;
    const first = sm.sendMessage(managed.id, 'first');
    await sm.sendMessage(managed.id, 'second');
    expect(turns).toHaveLength(0);
    summary.resolve(); await first;
    for (let i = 0; i < 20 && turns.length < 2; i++) await new Promise(r => setTimeout(r, 2));
    expect(turns.map(t => t.message)).toEqual(['first', 'second']);
  });

  it('does not run a message cancelled during the summary wait', async () => {
    const { managed, turns } = await sessionWithAgent('cancel-wait');
    managed.pendingHandoffSummary = new Promise<void>(() => {});
    const sending = sm.sendMessage(managed.id, 'cancel me');
    await new Promise(r => setTimeout(r, 10)); await sm.cancelProcessing(managed.id);
    await sending; expect(turns).toHaveLength(0); expect(managed.isProcessing).toBe(false);
  });

  it('drops a late summary after timeout and after deletion without reviving a session', async () => {
    const { managed, turns } = await sessionWithAgent('late');
    const source = createManagedSession({ id: 'source' }, workspace() as never);
    const summary = deferred<string>(); (sm as any).generateSessionHandoffSummary = () => summary.promise;
    managed.pendingHandoffSummary = (sm as any).attachHandoffSummary(source, managed);
    (sm as any).handoffSummaryWaitMs = 5;
    await sm.sendMessage(managed.id, 'go');
    summary.resolve('too late'); await managed.pendingHandoffSummary;
    expect(turns[0]?.summary).toBeUndefined(); expect(managed.transferredSessionSummary).toBeUndefined();
    const next = await sessionWithAgent('deleted');
    const later = deferred<string>(); (sm as any).generateSessionHandoffSummary = () => later.promise;
    const pending = (sm as any).attachHandoffSummary(source, next.managed);
    await sm.deleteSession(next.managed.id); later.resolve('deleted context'); await pending;
    expect(sessions().has('deleted')).toBe(false); expect(next.managed.transferredSessionSummary).toBeUndefined();
  });

})
