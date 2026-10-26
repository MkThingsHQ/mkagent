import { describe, expect, it, mock } from 'bun:test'
import { RPC_CHANNELS } from '@mkagent/shared/protocol'
const remove = mock(async (_id: string) => true)
mock.module('@mkagent/shared/config', () => ({
  getWorkspaceByNameOrId: () => null, addWorkspace: () => null,
  removeWorkspace: remove, setActiveWorkspace: () => {},
}))
const { registerWorkspaceCoreHandlers } = await import('./workspace')

describe('workspace unregister RPC lifecycle', () => {
  it('protects caller and other-window workspaces, and unregisters only inactive ones', async () => {
    const handlers = new Map<string, (...args: any[]) => any>()
    registerWorkspaceCoreHandlers({ handle: (channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler) } as never, {
      sessionManager: {}, platform: {},
      windowManager: { getAllWindowsForWorkspace: (id: string) => id === 'other-open' ? [{}] : [] },
    } as never)
    const handler = handlers.get(RPC_CHANNELS.workspaces.REMOVE)!
    expect(await handler({ workspaceId: 'current' }, 'current')).toBe(false)
    expect(await handler({ workspaceId: 'current' }, 'other-open')).toBe(false)
    expect(remove).not.toHaveBeenCalled()
    expect(await handler({ workspaceId: 'current' }, 'inactive')).toBe(true)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('inactive')
  })
})
