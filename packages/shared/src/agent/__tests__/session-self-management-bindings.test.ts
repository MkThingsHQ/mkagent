import { afterEach, describe, expect, it } from 'bun:test'
import { createPiContext } from '../pi-context.ts'
import { attachSessionSelfManagementBindings } from '../session-self-management-bindings.ts'
import {
  mergeSessionScopedToolCallbacks,
  registerSessionScopedToolCallbacks,
  unregisterSessionScopedToolCallbacks,
} from '../session-scoped-tool-callback-registry.ts'

const sessionId = 'binding-session'

afterEach(() => unregisterSessionScopedToolCallbacks(sessionId))

function makeContext() {
  const context = createPiContext({
    sessionId,
    workspacePath: '/tmp/mkagent-bindings',
    onPlanSubmitted: () => {},
  })
  attachSessionSelfManagementBindings(context, sessionId)
  return context
}

describe('Pi session self-management bindings', () => {
  it('has no self-management callbacks before registration', () => {
    const context = makeContext()
    expect(context.getSessionInfo).toBeUndefined()
    expect(context.listSessions).toBeUndefined()
    expect(context.listBackgroundTasks).toBeUndefined()
    expect(context.sendAgentMessage).toBeUndefined()
  })

  it('exposes only callbacks registered for the retained session tools', async () => {
    registerSessionScopedToolCallbacks(sessionId, {
      getSessionInfoFn: id => ({
        id: id ?? sessionId,
        name: 'Bound Session',
        permissionMode: 'ask',
        createdAt: 1,
        isActive: true,
      }),
      listSessionsFn: () => ({ total: 1, returned: 1, sessions: [{ id: sessionId, name: 'Bound Session', createdAt: 1 }] }),
      listBackgroundTasksFn: () => [{ taskId: 'task-1', status: 'running', startTime: 1, elapsedSeconds: 2 }],
      sendAgentMessageFn: async () => ({ delivery: 'delivered', targetBusy: false }),
    })
    const context = makeContext()

    expect(context.getSessionInfo?.()?.name).toBe('Bound Session')
    expect(context.listSessions?.().total).toBe(1)
    expect(context.listBackgroundTasks?.()[0]?.taskId).toBe('task-1')
    expect((await context.sendAgentMessage?.('other', 'hello'))?.delivery).toBe('delivered')
  })

  it('observes callbacks merged after context creation', () => {
    registerSessionScopedToolCallbacks(sessionId, {})
    const context = makeContext()
    expect(context.getSessionInfo).toBeUndefined()

    mergeSessionScopedToolCallbacks(sessionId, {
      getSessionInfoFn: () => ({
        id: sessionId,
        name: 'Late Binding',
        permissionMode: 'safe',
        createdAt: 1,
        isActive: true,
      }),
    })

    expect(context.getSessionInfo?.()?.name).toBe('Late Binding')
  })

  it('observes callback replacement without recreating context', () => {
    const context = makeContext()
    registerSessionScopedToolCallbacks(sessionId, {
      getSessionInfoFn: () => ({ id: sessionId, name: 'First', permissionMode: 'ask', createdAt: 1, isActive: true }),
    })
    expect(context.getSessionInfo?.()?.name).toBe('First')
    mergeSessionScopedToolCallbacks(sessionId, {
      getSessionInfoFn: () => ({ id: sessionId, name: 'Second', permissionMode: 'ask', createdAt: 1, isActive: true }),
    })
    expect(context.getSessionInfo?.()?.name).toBe('Second')
  })

  it('defaults getSessionInfo to the current session', () => {
    let received: string | undefined
    registerSessionScopedToolCallbacks(sessionId, {
      getSessionInfoFn: id => {
        received = id
        return { id: id ?? sessionId, name: 'Session', permissionMode: 'ask', createdAt: 1, isActive: true }
      },
    })
    const context = makeContext()
    context.getSessionInfo?.()
    expect(received).toBe(sessionId)
    context.getSessionInfo?.('other')
    expect(received).toBe('other')
  })

  it('defaults background task lookup to the current session', () => {
    let received: string | undefined
    registerSessionScopedToolCallbacks(sessionId, {
      listBackgroundTasksFn: id => {
        received = id
        return []
      },
    })
    const context = makeContext()
    context.listBackgroundTasks?.()
    expect(received).toBe(sessionId)
    context.listBackgroundTasks?.('other')
    expect(received).toBe('other')
  })

  it('keeps late send-message registration live', async () => {
    registerSessionScopedToolCallbacks(sessionId, {})
    const context = makeContext()
    expect(context.sendAgentMessage).toBeUndefined()
    mergeSessionScopedToolCallbacks(sessionId, {
      sendAgentMessageFn: async id => ({ delivery: id === 'other' ? 'delivered' : 'queued', targetBusy: false }),
    })
    expect((await context.sendAgentMessage?.('other', 'hello'))?.delivery).toBe('delivered')
  })
})
