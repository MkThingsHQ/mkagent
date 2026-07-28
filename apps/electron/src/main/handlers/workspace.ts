import { RPC_CHANNELS } from '@mkagent/shared/protocol'
import type { RpcServer } from '@mkagent/server-core/transport'
import type { HandlerDeps } from './handler-deps'

export const GUI_HANDLED_CHANNELS = [
  RPC_CHANNELS.window.OPEN_WORKSPACE,
  RPC_CHANNELS.window.OPEN_SESSION_IN_NEW_WINDOW,
  RPC_CHANNELS.window.CLOSE,
  RPC_CHANNELS.window.CONFIRM_CLOSE,
  RPC_CHANNELS.window.CANCEL_CLOSE,
  RPC_CHANNELS.window.SET_TRAFFIC_LIGHTS,
] as const

export function registerWorkspaceGuiHandlers(server: RpcServer, deps: HandlerDeps): void {
  const manager = deps.windowManager
  server.handle(RPC_CHANNELS.window.OPEN_WORKSPACE, async (_ctx, workspaceId: string) => manager?.focusOrCreateWindow(workspaceId))
  server.handle(RPC_CHANNELS.window.OPEN_SESSION_IN_NEW_WINDOW, async (_ctx, workspaceId: string, sessionId: string) => {
    manager?.createWindow({ workspaceId, focused: true, initialDeepLink: `mkagent://allSessions/session/${sessionId}` })
  })
  server.handle(RPC_CHANNELS.window.CLOSE, ctx => manager?.closeWindow(ctx.webContentsId!))
  server.handle(RPC_CHANNELS.window.CONFIRM_CLOSE, ctx => manager?.forceCloseWindow(ctx.webContentsId!))
  server.handle(RPC_CHANNELS.window.CANCEL_CLOSE, ctx => manager?.cancelPendingClose(ctx.webContentsId!))
  server.handle(RPC_CHANNELS.window.SET_TRAFFIC_LIGHTS, (ctx, visible: boolean) => manager?.setTrafficLightsVisible(ctx.webContentsId!, visible))
}
