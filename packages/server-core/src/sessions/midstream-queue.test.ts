import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveBackendContext } from '@mkagent/shared/agent/backend'
import {
  SessionManager,
  createManagedSession,
  resolveMidStreamDeliveryOutcome,
  clampSpawnPermissionMode,
} from './SessionManager.ts'
import { buildBackendRuntimeSignature, buildRestartRequiredSignature } from './runtime-config.ts'

describe('mid-stream queue runtime invariants', () => {
  let tmpRoot: string
  let sm: SessionManager

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'sm-midstream-'))
    sm = new SessionManager()
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  function buildSession(id: string) {
    const workspace = {
      id: 'ws-test',
      name: 'Test Workspace',
      rootPath: tmpRoot,
      createdAt: Date.now(),
    }
    const managed = createManagedSession(
      { id, name: 'mid-stream test' },
      workspace as never,
      { messagesLoaded: true },
    )
    ;(sm as unknown as { sessions: Map<string, unknown> }).sessions.set(id, managed)
    return managed
  }

  it('queues messages during manual compaction without calling redirect', async () => {
    const managed = buildSession('compacting')
    const redirect = mock(() => true)
    managed.isProcessing = true
    managed.agent = { isCompactionInFlight: () => true, redirect } as never
    ;(sm as any).flushSession = async () => {}
    await sm.sendMessage(managed.id, 'continue after compact')
    expect(redirect).not.toHaveBeenCalled()
    expect(managed.messageQueue.map(item => item.message)).toEqual(['continue after compact'])
    expect(managed.messages.at(-1)?.isQueued).toBe(true)
  })

  it('claims a pending plan only once after manual completion and while idle', async () => {
    const managed = buildSession('pending-plan')
    managed.pendingPlanExecution = { planPath: '/tmp/plan.md', awaitingCompaction: true, executionDispatched: false }
    await sm.markCompactionComplete(managed.id)
    expect(managed.pendingPlanExecution.awaitingCompaction).toBe(true)
    expect(await sm.markPendingPlanExecutionDispatched(managed.id)).toBe(false)
    ;(sm as any).handleAgentEvent(managed, { type: 'info', message: 'Compacted automatically', compactionTrigger: 'auto' })
    expect(managed.pendingPlanExecution.awaitingCompaction).toBe(true)
    ;(sm as any).handleAgentEvent(managed, { type: 'compaction_failed' })
    expect(managed.pendingPlanExecution.awaitingCompaction).toBe(true)
    ;(sm as any).handleAgentEvent(managed, { type: 'info', message: 'Compacted', compactionTrigger: 'manual' })
    managed.isProcessing = true
    expect(await sm.markPendingPlanExecutionDispatched(managed.id)).toBe(false)
    managed.isProcessing = false
    expect(await sm.markPendingPlanExecutionDispatched(managed.id)).toBe(true)
    expect(await sm.markPendingPlanExecutionDispatched(managed.id)).toBe(false)
  })

  it('preserves fresh context occupancy separately from billing usage', () => {
    const managed = buildSession('context-usage')
    const contextUsage = { usedTokens: 100, limitTokens: 1000, limitKind: 'compaction' as const, isEstimate: true, isStale: false, canCompact: true }
    ;(sm as any).handleAgentEvent(managed, { type: 'context_usage', contextUsage })
    ;(sm as any).handleAgentEvent(managed, { type: 'usage_update', usage: { inputTokens: 5000 } })
    expect(managed.tokenUsage.contextUsage).toEqual(contextUsage)
    expect(managed.tokenUsage.inputTokens).toBe(5000)
  })

  it('never gives a spawned session more permission than its parent', () => {
    expect(clampSpawnPermissionMode('allow-all', 'ask')).toBe('ask')
    expect(clampSpawnPermissionMode('ask', 'safe')).toBe('safe')
    expect(clampSpawnPermissionMode('safe', 'allow-all')).toBe('safe')
    expect(clampSpawnPermissionMode(undefined, undefined)).toBe('ask')
  })

  it('distinguishes non-interrupting queue mode from a failed steer', () => {
    expect(resolveMidStreamDeliveryOutcome('queue', false)).toEqual({
      shouldQueue: true,
      wasInterrupted: false,
    })
    expect(resolveMidStreamDeliveryOutcome('steer', false)).toEqual({
      shouldQueue: true,
      wasInterrupted: true,
    })
    expect(resolveMidStreamDeliveryOutcome('steer', true)).toEqual({
      shouldQueue: false,
      wasInterrupted: false,
    })
  })

  it('re-stamps replay after the prior final response and emits that timestamp', async () => {
    const sessionId = 'queue-ordering'
    const managed = buildSession(sessionId)
    const priorFinalTimestamp = Date.now()
    managed.messages = [
      {
        id: 'initial-user',
        role: 'user',
        content: 'question',
        timestamp: priorFinalTimestamp - 200,
      },
      {
        id: 'queued-user',
        role: 'user',
        content: 'follow up',
        timestamp: priorFinalTimestamp - 100,
        isQueued: true,
      },
      {
        id: 'prior-answer',
        role: 'assistant',
        content: 'complete answer',
        timestamp: priorFinalTimestamp,
      },
    ]
    managed.messageQueue.push({
      message: 'follow up',
      messageId: 'queued-user',
      optimisticMessageId: 'optimistic-user',
    })

    const events: any[] = []
    sm.setEventSink((_channel, _target, event) => events.push(event))
    ;(sm as unknown as { lastTimestamp: number }).lastTimestamp = priorFinalTimestamp
    ;(sm as unknown as { persistSession: () => void }).persistSession = () => {}
    const sendMessage = mock(async () => {})
    ;(sm as unknown as { sendMessage: typeof sendMessage }).sendMessage = sendMessage

    ;(sm as unknown as { processNextQueuedMessage: (id: string) => void })
      .processNextQueuedMessage(sessionId)
    await new Promise<void>(resolve => setImmediate(resolve))

    const replayed = managed.messages.find(message => message.id === 'queued-user')
    expect(replayed?.isQueued).toBe(false)
    expect(replayed?.timestamp).toBeGreaterThan(priorFinalTimestamp)

    const processingEvent = events.find(event => event.type === 'user_message')
    expect(processingEvent?.status).toBe('processing')
    expect(processingEvent?.message.timestamp).toBe(replayed?.timestamp)
    expect(processingEvent?.optimisticMessageId).toBe('optimistic-user')
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('replays a queued message without duplicating the persisted user message', async () => {
    const sessionId = 'queue-no-duplicate'
    const managed = buildSession(sessionId)
    let releaseFirstTurn!: () => void
    const firstTurnReleased = new Promise<void>(resolve => { releaseFirstTurn = resolve })
    let markFirstTurnStarted!: () => void
    const firstTurnStarted = new Promise<void>(resolve => { markFirstTurnStarted = resolve })
    let turn = 0

    managed.agent = {
      isProcessing: () => false,
      updateRuntimeConfig: async () => true,
      redirect: () => false,
      chat: async function* () {
        turn += 1
        if (turn === 1) {
          markFirstTurnStarted()
          await firstTurnReleased
        }
      },
      destroy: () => {},
      dispose: () => {},
    } as never
    const context = resolveBackendContext({})
    managed.backendRuntimeSignature = buildBackendRuntimeSignature({
      connection: context.connection,
      provider: context.provider,
      authType: context.authType,
      resolvedModel: context.resolvedModel,
    })
    managed.backendRestartSignature = buildRestartRequiredSignature({
      connection: context.connection,
      provider: context.provider,
      authType: context.authType,
      resolvedModel: context.resolvedModel,
    })

    let completedTurns = 0
    let resolveBothTurns!: () => void
    const bothTurnsCompleted = new Promise<void>(resolve => { resolveBothTurns = resolve })
    sm.onSessionComplete(() => {
      if (++completedTurns === 2) resolveBothTurns()
    })

    const firstSend = sm.sendMessage(sessionId, 'first question')
    await firstTurnStarted
    await sm.sendMessage(sessionId, 'follow up')
    releaseFirstTurn()
    await firstSend
    await bothTurnsCompleted

    const session = await sm.getSession(sessionId)
    expect(session?.messages.filter(message => message.role === 'user' && message.content === 'follow up')).toHaveLength(1)
  })
})
