/**
 * PR watcher RPCs (Coding mode's chat-header PR chip). The registry runs here, on the workspace
 * server: it has the session's folder, the `gh` login, so tokens never reach a
 * client. Clients subscribe per session and receive `prWatch:changed` pushes.
 */

import { RPC_CHANNELS, type PrDetails, type PrWatchState } from '@mkagent/shared/protocol'
import { getWorkspaceByNameOrId } from '@mkagent/shared/config'
import { pushTyped, type RpcServer } from '@mkagent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { githubGraphql } from '../../services/pr-watch/github-client'
import { PrWatchRegistry } from '../../services/pr-watch/registry'
import { tokenCandidates } from '../../services/pr-watch/token-chain'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.prWatch.SUBSCRIBE,
  RPC_CHANNELS.prWatch.UNSUBSCRIBE,
  RPC_CHANNELS.prWatch.REFRESH,
  RPC_CHANNELS.prWatch.GET_DETAILS,
] as const

let registry: PrWatchRegistry | null = null
let stopTurnListener: (() => void) | undefined

/** Drops a disconnected client's subscriptions (wired into the server's client cleanup). */
export function cleanupPrWatchForClient(clientId: string): void {
  registry?.dropClient(clientId)
}

export function registerPrWatchHandlers(server: RpcServer, deps: HandlerDeps): void {
  const log = deps.platform.logger
  registry?.dispose()
  stopTurnListener?.()
  const current = new PrWatchRegistry({
    graphql: (host, token, query, variables) => githubGraphql(host, token, query, variables),
    candidates: async (host) => tokenCandidates(host, []),
    push: (clientId, sessionId, state) => pushTyped(server, RPC_CHANNELS.prWatch.CHANGED, { to: 'client', clientId }, sessionId, state),
    log: message => log.info(message),
  })
  registry = current

  // A finished turn is when pushes and `gh pr create` happen: refetch then
  stopTurnListener = deps.sessionManager.onTurnComplete?.(sessionId => {
    void current.nudge(sessionId)
  })

  server.handle(RPC_CHANNELS.prWatch.SUBSCRIBE, async (ctx, sessionId: string): Promise<{ subscriptionId: string | null; state: PrWatchState }> => {
    const session = await deps.sessionManager.getSession(sessionId)
    if (!session?.codingMode) return { subscriptionId: null, state: { kind: 'unavailable', reason: 'not-git' } }
    const dir = deps.sessionManager.getSessionWorkingDirectory(sessionId) ?? session.workingDirectory
    const workspace = getWorkspaceByNameOrId(session.workspaceId)
    if (!dir || !workspace) return { subscriptionId: null, state: { kind: 'unavailable', reason: 'not-git' } }
    return current.subscribe({ clientId: ctx.clientId, sessionId, dir, workspaceRootPath: workspace.rootPath })
  })

  server.handle(RPC_CHANNELS.prWatch.UNSUBSCRIBE, async (_ctx, subscriptionId: string) => {
    current.unsubscribe(subscriptionId)
  })

  server.handle(RPC_CHANNELS.prWatch.REFRESH, async (ctx, sessionId: string) => {
    await current.nudge(sessionId, ctx.clientId)
  })

  server.handle(RPC_CHANNELS.prWatch.GET_DETAILS, async (ctx, sessionId: string): Promise<PrDetails | null> => {
    return current.getDetails(sessionId, ctx.clientId)
  })
}
