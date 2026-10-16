import { describe, expect, it } from 'bun:test'
import { SessionManager, createManagedSession } from './SessionManager'
import { AbortReason, type AgentBackend } from '@mkagent/shared/agent/backend'
import type { AgentEvent } from '@mkagent/core/types'

describe('Lite Stop lifecycle', () => {
  it('reports a stopped turn as cancelled even when the backend emits complete, and retains background work', async () => {
    const manager = new SessionManager()
    const session = createManagedSession({ id: 'stop' }, { id: 'ws', slug: 'ws', name: 'ws', rootPath: '/unused', createdAt: 1 })
    let stops = 0
    let hardStops = 0
    let childStops = 0
    session.backgroundTaskRegistry.set('shell', { taskId: 'shell', startTime: 1, status: 'running' })
    const child = createManagedSession({ id: 'child', parentSessionId: 'stop' }, session.workspace)
    child.agent = { forceAbort: () => { childStops++ } } as unknown as AgentBackend
    const agent = {
      stopTurn: () => { stops++; return true },
      forceAbort: () => { hardStops++ },
      async *chat(): AsyncGenerator<AgentEvent> {
        await manager.cancelProcessing(session.id)
        yield { type: 'complete' }
      },
    } as unknown as AgentBackend
    session.agent = agent
    const harness = manager as unknown as {
      sessions: Map<string, typeof session>
      getOrCreateAgent(): Promise<AgentBackend>
      flushSession(): Promise<void>
      runTurn(managed: typeof session, message: string): Promise<void>
    }
    harness.sessions.set(session.id, session)
    harness.sessions.set(child.id, child)
    harness.getOrCreateAgent = async () => agent
    harness.flushSession = async () => {}
    const completions: string[] = []
    manager.onSessionComplete(event => { completions.push(event.stopReason) })
    await harness.runTurn(session, 'start')
    expect(completions).toEqual(['cancelled'])
    expect(stops).toBe(1)
    expect(hardStops).toBe(0)
    expect(childStops).toBe(0)
    expect(session.backgroundTaskRegistry.get('shell')?.status).toBe('running')
  })

  it('falls back to foreground abort when stopTurn is unavailable', async () => {
    const manager = new SessionManager()
    const session = createManagedSession({ id: 'fallback' }, { id: 'ws', slug: 'ws', name: 'ws', rootPath: '/unused', createdAt: 1 })
    const reasons: AbortReason[] = []
    session.isProcessing = true
    session.agent = { forceAbort: reason => { reasons.push(reason) } } as AgentBackend
    ;(manager as unknown as { sessions: Map<string, typeof session> }).sessions.set(session.id, session)
    await manager.cancelProcessing(session.id)
    expect(reasons).toEqual([AbortReason.UserStop])
    expect(session.isProcessing).toBe(false)
  })
})
