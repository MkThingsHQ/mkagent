/**
 * PR watcher RPCs (Coding mode's chat-header PR carousel). The registry runs here, on the workspace
 * server: it has the session's folder, the `gh` login, so tokens never reach a
 * client. Clients subscribe per session and receive `prWatch:changed` pushes carrying the session's
 * whole PR set. Bind / unbind / auto-merge / auto-fix go through the shared ops so the agent tools and
 * the chip UI take exactly the same path. The auto-fix monitor (the Fix toggle) also lives here: it
 * holds its own registry subscriptions, so it runs whether or not a window shows the session.
 */

import { RPC_CHANNELS, type PrAutoFixResult, type PrDetails, type PrMergeMethod, type PrWatchSessionState } from '@mkagent/shared/protocol'
import { getWorkspaceByNameOrId } from '@mkagent/shared/config'
import type {
  PrBindToolResult,
  PrUnbindToolResult,
  PrAutoMergeToolResult,
} from '@mkagent/session-tools-core'
import { pushTyped, type RpcServer } from '@mkagent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { AUTO_FIX_CLIENT_ID, createAutoFixMonitor, type AutoFixMonitor } from '../../pr-watch/auto-fix'
import { createPrWatchOps } from '../../pr-watch/operations'
import { githubGraphql } from '../../services/pr-watch/github-client'
import { PrWatchRegistry } from '../../services/pr-watch/registry'
import { tokenCandidates } from '../../services/pr-watch/token-chain'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.prWatch.SUBSCRIBE,
  RPC_CHANNELS.prWatch.UNSUBSCRIBE,
  RPC_CHANNELS.prWatch.REFRESH,
  RPC_CHANNELS.prWatch.GET_DETAILS,
  RPC_CHANNELS.prWatch.BIND,
  RPC_CHANNELS.prWatch.UNBIND,
  RPC_CHANNELS.prWatch.SET_AUTO_MERGE,
  RPC_CHANNELS.prWatch.SET_AUTO_FIX,
] as const

let registry: PrWatchRegistry | null = null
let autoFixMonitor: AutoFixMonitor | null = null
let stopSessionListener: (() => void) | undefined
let stopTurnListener: (() => void) | undefined

/** The live registry instance, so the session-tool bridge (SessionManager) can reach it (D3). */
export function getPrWatchRegistry(): PrWatchRegistry | null {
  return registry
}

/** The live auto-fix monitor, so the tool bridge can re-sync it after an unbind. */
export function getPrAutoFixMonitor(): AutoFixMonitor | null {
  return autoFixMonitor
}

/** Drops a disconnected client's subscriptions (wired into the server's client cleanup). */
export function cleanupPrWatchForClient(clientId: string): void {
  registry?.dropClient(clientId)
}

const resolveWorkspaceRootPath = (workspaceId: string) => getWorkspaceByNameOrId(workspaceId)?.rootPath ?? null

export function registerPrWatchHandlers(server: RpcServer, deps: HandlerDeps): void {
  const log = deps.platform.logger
  stopSessionListener?.()
  stopTurnListener?.()
  autoFixMonitor?.dispose()
  registry?.dispose()
  let monitor: AutoFixMonitor | null = null
  const current = new PrWatchRegistry({
    graphql: (host, token, query, variables) => githubGraphql(host, token, query, variables),
    candidates: async host => tokenCandidates(host, []),
    push: (clientId, sessionId, state) => {
      // Auto-fix's own subscription: evaluate instead of sending anywhere
      if (clientId === AUTO_FIX_CLIENT_ID) return monitor?.onState(sessionId, state)
      pushTyped(server, RPC_CHANNELS.prWatch.CHANGED, { to: 'client', clientId }, sessionId, state)
    },
    log: message => log.info(message),
  })
  registry = current
  monitor = createAutoFixMonitor({
    getRegistry: () => current,
    sessionManager: deps.sessionManager,
    resolveWorkspaceRootPath,
    log: message => log.info(message),
  })
  autoFixMonitor = monitor
  const armed = monitor
  const ops = createPrWatchOps(current, deps.sessionManager, { onMonitorsChanged: sessionId => void armed.sync(sessionId) })

  // A finished turn is when pushes and `gh pr create` happen: refetch then
  stopTurnListener = deps.sessionManager.onTurnComplete?.(sessionId => {
    void current.nudge(sessionId)
  })

  stopSessionListener = deps.sessionManager.onPrWatchSessionChange?.(sessionId => {
    if (sessionId === null) { armed.dispose(); current.dispose(); return }
    const session = deps.sessionManager.getSessionSnapshot(sessionId)
    if (!session || !session.codingMode || session.isArchived) current.dropSession(sessionId)
    void armed.sync(sessionId)
  })

  // Auto-fix survives restarts: re-arm every session that has it on once sessions are loaded
  void Promise.resolve()
    .then(() => deps.sessionManager.waitForInit())
    .then(() => armed.armAll())
    .catch(error => log.warn?.(`[pr-auto-fix] re-arming at start failed: ${error instanceof Error ? error.message : String(error)}`))

  server.handle(RPC_CHANNELS.prWatch.SUBSCRIBE, async (ctx, sessionId: string): Promise<{ subscriptionId: string | null; state: PrWatchSessionState }> => {
    const session = deps.sessionManager.getSessionSnapshot(sessionId)
    if (!session?.codingMode) return { subscriptionId: null, state: { kind: 'unavailable', reason: 'not-git' } }
    const dir = deps.sessionManager.getSessionWorkingDirectory(sessionId) ?? session.workingDirectory
    const workspaceRootPath = resolveWorkspaceRootPath(session.workspaceId)
    if (!dir || !workspaceRootPath) return { subscriptionId: null, state: { kind: 'unavailable', reason: 'not-git' } }
    return current.subscribe({
      clientId: ctx.clientId,
      sessionId,
      dir,
      workspaceRootPath,
      boundPrs: deps.sessionManager.getSessionBoundPrs(sessionId),
      monitors: deps.sessionManager.getSessionPrMonitors(sessionId),
    })
  })

  server.handle(RPC_CHANNELS.prWatch.UNSUBSCRIBE, async (_ctx, subscriptionId: string) => {
    current.unsubscribe(subscriptionId)
  })

  server.handle(RPC_CHANNELS.prWatch.REFRESH, async (ctx, sessionId: string) => {
    await current.nudge(sessionId, ctx.clientId)
  })

  server.handle(RPC_CHANNELS.prWatch.GET_DETAILS, async (ctx, sessionId: string, prId: string): Promise<PrDetails | null> => {
    return current.getDetails(sessionId, prId, ctx.clientId)
  })

  server.handle(RPC_CHANNELS.prWatch.BIND, async (_ctx, sessionId: string, ref: string): Promise<PrBindToolResult> => {
    return ops.bind(sessionId, ref)
  })

  server.handle(RPC_CHANNELS.prWatch.UNBIND, async (_ctx, sessionId: string, ref: string): Promise<PrUnbindToolResult> => {
    return ops.unbind(sessionId, ref)
  })

  server.handle(RPC_CHANNELS.prWatch.SET_AUTO_MERGE, async (_ctx, sessionId: string, ref: string, enabled: boolean, method?: PrMergeMethod): Promise<PrAutoMergeToolResult> => {
    return ops.setAutoMerge(sessionId, ref, enabled, method)
  })

  server.handle(RPC_CHANNELS.prWatch.SET_AUTO_FIX, async (_ctx, sessionId: string, prId: string, enabled: boolean): Promise<PrAutoFixResult> => {
    return ops.setAutoFix(sessionId, prId, enabled)
  })
}
