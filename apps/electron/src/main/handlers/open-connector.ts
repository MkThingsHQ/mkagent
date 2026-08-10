import { RPC_CHANNELS } from '@mkagent/shared/protocol'
import type { RpcServer } from '@mkagent/server-core/transport'
import type { HandlerDeps } from './handler-deps'
import { getOpenConnectorSidecarService } from '../open-connector-sidecar'

export const GUI_HANDLED_CHANNELS = [RPC_CHANNELS.openConnector.GET_CONSOLE] as const

export function registerOpenConnectorGuiHandlers(server: RpcServer, _deps: HandlerDeps): void {
  server.handle(RPC_CHANNELS.openConnector.GET_CONSOLE, async () => {
    return getOpenConnectorSidecarService().getConsoleInfo()
  })
}
