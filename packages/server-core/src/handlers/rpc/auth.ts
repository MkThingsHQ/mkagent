import { RPC_CHANNELS } from '@mkagent/shared/protocol'
import { getCredentialManager } from '@mkagent/shared/credentials'
import type { RpcServer } from '@mkagent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { requestClientConfirmDialog } from '@mkagent/server-core/transport'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.auth.SHOW_DELETE_SESSION_CONFIRMATION,
  RPC_CHANNELS.credentials.HEALTH_CHECK,
] as const

export function registerAuthHandlers(server: RpcServer, deps: HandlerDeps): void {
  // Show delete session confirmation dialog (routed to client)
  server.handle(RPC_CHANNELS.auth.SHOW_DELETE_SESSION_CONFIRMATION, async (ctx, name: string) => {
    const result = await requestClientConfirmDialog(server, ctx.clientId, {
      type: 'warning',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      title: 'Delete Conversation',
      message: `Are you sure you want to delete: "${name}"?`,
      detail: 'This action cannot be undone.',
    })
    // result.response is the index of the clicked button
    // 0 = Cancel, 1 = Delete
    return result.response === 1
  })

  // Credential health check - validates credential store is readable and usable
  // Called on app startup to detect corruption, machine migration, or missing credentials
  server.handle(RPC_CHANNELS.credentials.HEALTH_CHECK, async () => {
    const manager = getCredentialManager()
    return manager.checkHealth()
  })
}
