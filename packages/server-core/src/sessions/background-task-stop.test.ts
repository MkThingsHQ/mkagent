import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionManager, createManagedSession } from './SessionManager'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

describe('background tasks: stop from the chip, and live output', () => {
  let tmpRoot: string
  let sm: SessionManager

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'bg-stop-'))
    sm = new SessionManager()
  })
  afterEach(() => rmSync(tmpRoot, { recursive: true, force: true }))

  function build(id: string, agent?: Any) {
    const workspace = { id: 'ws_test', name: 'T', rootPath: tmpRoot, createdAt: Date.now() }
    const managed: Any = createManagedSession({ id, name: 't' }, workspace as never, { messagesLoaded: true })
    managed.isProcessing = false
    managed.agent = agent ?? null
    ;(sm as Any).sessions.set(id, managed)
    ;(sm as Any).keepBackgroundTasksAlive = true
    const nudges: string[] = []
    ;(sm as Any).sendMessage = async (_id: string, msg: string) => { nudges.push(msg) }
    return { managed, nudges }
  }
  const fire = (id: string, event: Any) => (sm as Any).processEvent((sm as Any).sessions.get(id), event)

  it('a stop the user asked for does not wake the idle session', async () => {
    const stopped: string[] = []
    const { nudges } = build('s1', { stopBackgroundTask: async (taskId: string) => { stopped.push(taskId); return true } })
    await fire('s1', { type: 'shell_backgrounded', toolUseId: 'tu1', shellId: 'b1', command: 'bun test --watch' })
    expect(await sm.stopBackgroundTask('s1', 'b1')).toEqual({ success: true })
    expect(stopped).toEqual(['b1'])
    await fire('s1', { type: 'task_completed', taskId: 'b1', status: 'stopped', toolUseId: 'tu1', launchedHere: true, outputFile: '/tmp/x/b1.output' })
    expect(nudges).toEqual([])
  })

  it('still reports a task that stopped on its own', async () => {
    const { nudges } = build('s1b', { stopBackgroundTask: async () => true })
    await fire('s1b', { type: 'shell_backgrounded', toolUseId: 'tu1', shellId: 'b1', command: 'bun test' })
    await fire('s1b', { type: 'task_completed', taskId: 'b1', status: 'stopped', toolUseId: 'tu1', launchedHere: true })
    expect(nudges.length).toBe(1)
  })

  it('answers not-running (and records it) when nothing alive can take the stop', async () => {
    const { managed } = build('s2', { stopBackgroundTask: async () => { throw new Error('No task found with ID: zz. Running background agents: a1 (Review)') } })
    await fire('s2', { type: 'shell_backgrounded', toolUseId: 'tu2', shellId: 'zz' })
    expect(await sm.stopBackgroundTask('s2', 'zz')).toEqual({ success: false, error: 'not-running' })
    expect(managed.backgroundTaskRegistry.get('zz').status).toBe('stopped')
    // Already terminal: the agent is not asked again
    expect(await sm.stopBackgroundTask('s2', 'zz')).toEqual({ success: false, error: 'not-running' })

    build('s3', {})
    expect(await sm.stopBackgroundTask('s3', 'x')).toEqual({ success: false, error: 'not-running' })
    build('s4', { stopBackgroundTask: async () => { throw new Error('permission denied') } })
    expect(await sm.stopBackgroundTask('s4', 'x')).toEqual({ success: false, error: 'failed' })
  })

  it('keeps a task running when stop delivery times out or transport is unavailable', async () => {
    for (const message of ['Background task stop timed out', 'Background task transport unavailable']) {
      const { managed } = build('uncertain', { stopBackgroundTask: async () => { throw new Error(message) } })
      await fire('uncertain', { type: 'shell_backgrounded', toolUseId: 'tu', shellId: 'live' })
      expect(await sm.stopBackgroundTask('uncertain', 'live')).toEqual({ success: false, error: 'failed' })
      expect(managed.backgroundTaskRegistry.get('live').status).toBe('running')
      expect(managed.backgroundTaskRegistry.get('live').stopRequestedAt).toBeUndefined()
    }
  })

  it("reads a running shell's output from the file its launch acknowledgement names", async () => {
    const { managed } = build('s5')
    const dir = join(tmpRoot, 'tasks')
    mkdirSync(dir)
    const out = join(dir, 'b2.output')
    writeFileSync(out, 'line1\nline2\n')
    await fire('s5', { type: 'shell_backgrounded', toolUseId: 'tu5', shellId: 'b2' })
    await fire('s5', { type: 'tool_result', toolName: 'Bash', toolUseId: 'tu5', result: `Command running in background with ID: b2. Output is being written to: ${out}. You will be notified when it completes.` })
    expect(managed.messages).toHaveLength(0)
    expect(await sm.getBackgroundTaskOutput('s5', 'b2', 'shell')).toEqual({ kind: 'text', text: 'line1\nline2\n', truncated: false })
    expect(await sm.getBackgroundTaskOutput('s5', 'unknown', 'shell')).toBeNull()
  })

  it('preserves live task chips when their foreground turn completes or is interrupted', async () => {
    const { managed } = build('lifetime', { forceAbort: () => {} })
    const sent: Any[] = []
    ;(sm as Any).emit = (_workspaceId: string, event: Any) => sent.push(event)
    await fire('lifetime', { type: 'shell_backgrounded', toolUseId: 'tool', shellId: 'live' })
    await fire('lifetime', { type: 'complete' })
    expect(sent.at(-1)).toMatchObject({ type: 'complete', backgroundTasksAlive: true })
    managed.isProcessing = true
    await sm.cancelProcessing('lifetime')
    expect(sent.at(-1)).toMatchObject({ type: 'interrupted', backgroundTasksAlive: true })
    await fire('lifetime', { type: 'task_completed', taskId: 'live', status: 'stopped', toolUseId: 'tool', launchedHere: true })
    await fire('lifetime', { type: 'complete' })
    expect(sent.at(-1)).toMatchObject({ type: 'complete', backgroundTasksAlive: false })
  })

  it('forwards activity only for tasks with a chip', async () => {
    build('s6')
    const sent: Any[] = []
    ;(sm as Any).emit = (_workspaceId: string, event: Any) => { sent.push(event) }
    await fire('s6', { type: 'task_backgrounded', toolUseId: 'tu6', taskId: 'a1' })
    sent.length = 0
    await fire('s6', { type: 'task_activity', taskId: 'a1', toolUses: 3 })
    await fire('s6', { type: 'task_activity', taskId: 'foreground-agent', toolUses: 9 })
    expect(sent.map(e => e.taskId)).toEqual(['a1'])
  })
})
