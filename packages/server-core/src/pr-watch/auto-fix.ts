/**
 * Auto-fix — the PR card's Fix toggle. While it is on for a PR, the server looks for new review
 * feedback on that PR every 5 minutes and, when some arrived, starts a hidden turn in the session
 * with the Fix template (`autoFixMessage`).
 *
 * Server-held: each session with auto-fix on keeps its own registry subscription
 * (`AUTO_FIX_CLIENT_ID`), so it keeps working while the window is minimized, the screen is locked
 * or another session is in view — as long as the app runs and the machine is awake. It re-arms at
 * app start for every session that has it on.
 *
 * It only acts when all hold:
 *  - the PR is the branch's own PR (`canFixLocally`): fixes run on the folder's checkout, so a pinned
 *    PR is never touched, even with auto-fix stored on for it (the branch changed since);
 *  - the PR is open or draft, has review feedback and no merge conflicts (`autoFixApplies`);
 *  - the session is idle (never mid-turn) and not in Explore, which can't edit files;
 *  - at most one check and one run per PR per `AUTO_FIX_INTERVAL_MS`;
 *  - the feedback is new since the last run (`hasNewReviewFeedback`). The signature leaves out the
 *    viewer's own comments, so the agent replying on GitHub can't re-trigger it, and a fix that was
 *    only committed locally doesn't re-trigger it either (GitHub's threads didn't change).
 * One fix turn at a time per session; the prompt keeps the agent local (no push, no replies).
 */

import type { PrWatchSessionState } from '@mkagent/shared/protocol'
import { AUTO_FIX_INTERVAL_MS, autoFixApplies, autoFixMessage, canFixLocally, hasNewReviewFeedback } from '@mkagent/shared/pr-watch'
import type { ISessionManager } from '../handlers/session-manager-interface'
import { parsePrReference } from '../services/pr-watch/pr-ref'
import type { PrWatchRegistry } from '../services/pr-watch/registry'
import { resolveRepo, type RepoInfo } from '../services/pr-watch/local-git'

/** The registry client id of auto-fix's own subscriptions (its pushes never reach a real client). */
export const AUTO_FIX_CLIENT_ID = '__pr-auto-fix__'

export interface AutoFixMonitorDeps {
  /** The live registry (recreated when the RPC handlers re-register) */
  getRegistry: () => PrWatchRegistry | null
  sessionManager: ISessionManager
  resolveWorkspaceRootPath: (workspaceId: string) => string | null
  now?: () => number
  resolveRepo?: (dir: string) => Promise<RepoInfo | null>
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
  log?: (message: string) => void
}

export interface AutoFixMonitor {
  /** Arm or disarm a session's monitor to match its auto-fix state; call after any change to it. */
  sync(sessionId: string): Promise<void>
  /** Arm every session that has auto-fix on (app start). */
  armAll(): Promise<void>
  /** The registry pushed a session's aggregate to the monitor's subscription. */
  onState(sessionId: string, state: PrWatchSessionState): void
  /** Sessions currently armed (for logs and tests). */
  armedSessions(): string[]
  /** Disarm everything (registry teardown). */
  dispose(): void
}

export function createAutoFixMonitor(deps: AutoFixMonitorDeps): AutoFixMonitor {
  const now = deps.now ?? Date.now
  const log = deps.log ?? (() => {})
  /** sessionId → the monitor's subscription and the folder it was armed for */
  const armed = new Map<string, { subscriptionId: string; dir: string }>()
  /** `${sessionId}|${prId}` → when its review feedback was last checked (the 5-minute cadence) */
  const lastCheckAt = new Map<string, number>()
  /** Sessions with an evaluation running: pushes arriving meanwhile are dropped, not queued */
  const evaluating = new Set<string>()
  /** Per-session sync chain, so a quick on/off/on never arms twice */
  const syncing = new Map<string, Promise<void>>()
  const versions = new Map<string, number>()
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms) as ReturnType<typeof setTimeout>)
  const clearTimer = deps.clearTimer ?? ((handle: ReturnType<typeof setTimeout>) => clearTimeout(handle))

  // A server timer gives auto-fix its own five-minute cadence, independent of adaptive header
  // polling or window visibility. No catch-up loop after sleep; one check on the next wake.
  function schedule(): void {
    if (disposed || timer || !armed.size) return
    timer = setTimer(() => {
      timer = undefined
      void Promise.all([...armed.keys()].map(async id => {
        await sync(id)
        if (!disposed && armed.has(id)) await deps.getRegistry()?.nudge(id, AUTO_FIX_CLIENT_ID)
      })).catch(error => log(`[pr-auto-fix] tick: ${String(error)}`)).finally(schedule)
    }, AUTO_FIX_INTERVAL_MS)
    ;(timer as unknown as { unref?: () => void })?.unref?.()
  }

  const hasAutoFix = (sessionId: string) =>
    Object.values(deps.sessionManager.getSessionPrMonitors(sessionId)).some(monitor => monitor.autoFix)

  function disarm(sessionId: string): void {
    versions.set(sessionId, (versions.get(sessionId) ?? 0) + 1)
    const entry = armed.get(sessionId)
    if (!entry) return
    armed.delete(sessionId)
    deps.getRegistry()?.unsubscribe(entry.subscriptionId)
    if (!armed.size && timer) { clearTimer(timer); timer = undefined }
    for (const key of [...lastCheckAt.keys()]) {
      if (key.startsWith(`${sessionId}|`)) lastCheckAt.delete(key)
    }
    log(`[pr-auto-fix] ${sessionId}: disarmed`)
  }

  async function doSync(sessionId: string): Promise<void> {
    if (disposed) return
    const registry = deps.getRegistry()
    const session = deps.sessionManager.getSessionSnapshot(sessionId)
    if (!registry || !session?.codingMode || session.isArchived || !hasAutoFix(sessionId)) {
      disarm(sessionId)
      return
    }
    const dir = deps.sessionManager.getSessionWorkingDirectory(sessionId) ?? session.workingDirectory
    const workspaceRootPath = deps.resolveWorkspaceRootPath(session.workspaceId)
    if (!dir || !workspaceRootPath) {
      disarm(sessionId)
      return
    }
    const current = armed.get(sessionId)
    // Same folder: the bind/unbind/toggle ops keep its targets and monitors current
    if (current?.dir === dir) return
    if (current) disarm(sessionId)
    const version = versions.get(sessionId) ?? 0
    const { subscriptionId, state } = await registry.subscribe({
      clientId: AUTO_FIX_CLIENT_ID,
      sessionId,
      dir,
      workspaceRootPath,
      boundPrs: deps.sessionManager.getSessionBoundPrs(sessionId),
      monitors: deps.sessionManager.getSessionPrMonitors(sessionId),
    })
    if (disposed || version !== (versions.get(sessionId) ?? 0) || !hasAutoFix(sessionId)) {
      registry.unsubscribe(subscriptionId)
      return
    }
    armed.set(sessionId, { subscriptionId, dir })
    schedule()
    log(`[pr-auto-fix] ${sessionId}: armed`)
    // Joining a watcher that already has data gets no push until its next poll: look right away
    if (state.kind === 'ready') await evaluate(sessionId, state)
  }

  function sync(sessionId: string): Promise<void> {
    const previous = syncing.get(sessionId) ?? Promise.resolve()
    const next = previous.then(() => doSync(sessionId)).catch(error => {
      log(`[pr-auto-fix] ${sessionId}: sync failed: ${(error as Error).message}`)
    })
    syncing.set(sessionId, next)
    void next.finally(() => {
      if (syncing.get(sessionId) === next) syncing.delete(sessionId)
    })
    return next
  }

  async function evaluate(sessionId: string, state: PrWatchSessionState): Promise<void> {
    if (disposed || state.kind !== 'ready' || evaluating.has(sessionId) || !armed.has(sessionId)) return
    const registry = deps.getRegistry()
    const session = deps.sessionManager.getSessionSnapshot(sessionId)
    if (!registry || !session?.codingMode || session.isArchived) {
      void sync(sessionId)
      return
    }
    // Explore can't edit files; a busy session is looked at again on a later push (turn end refetches)
    if (session.permissionMode === 'safe' || session.isProcessing) return
    const workspaceRootPath = deps.resolveWorkspaceRootPath(session.workspaceId)
    if (!workspaceRootPath) return

    const monitors = deps.sessionManager.getSessionPrMonitors(sessionId)
    const version = versions.get(sessionId) ?? 0
    const dir = armed.get(sessionId)!.dir
    evaluating.add(sessionId)
    try {
      for (const entry of state.prs) {
        const monitor = monitors[entry.id]
        if (!monitor?.autoFix || !canFixLocally(entry.origin) || !autoFixApplies(entry.summary)) continue
        const key = `${sessionId}|${entry.id}`
        const at = now()
        if (at - (lastCheckAt.get(key) ?? -Infinity) < AUTO_FIX_INTERVAL_MS) continue
        if (monitor.lastFixAt && at - monitor.lastFixAt < AUTO_FIX_INTERVAL_MS) continue
        const ref = parsePrReference(entry.summary.url)
        if (!ref) continue
        lastCheckAt.set(key, at)

        const signature = await registry.fetchReviewSignature({ coords: ref, number: ref.number, workspaceRootPath }).catch((error: Error) => {
          log(`[pr-auto-fix] ${entry.id}: review check failed: ${error.message}`)
          return null
        })
        if (!signature) continue
        const otherMonitors = deps.sessionManager.getSessions().filter(other => other.id !== sessionId && other.prMonitors?.[entry.id])
        const previous = [...(monitor.lastFixSignature ?? []), ...otherMonitors.flatMap(other => other.prMonitors?.[entry.id]?.lastFixSignature ?? [])]
        if (!hasNewReviewFeedback(signature, previous)) continue

        // A network lookup can outlive Off, deletion, a directory/branch switch or a mode change.
        // Revalidate the checkout itself before dispatching an unattended edit.
        const checkout = await (deps.resolveRepo ?? resolveRepo)(dir).catch(() => null)
        const current = deps.sessionManager.getSessionSnapshot(sessionId)
        const currentMonitor = deps.sessionManager.getSessionPrMonitors(sessionId)[entry.id]
        const sameRepo = [checkout?.repo, checkout?.upstreamRepo].some(repo => repo
          && `${repo.host}/${repo.owner}/${repo.repo}`.toLowerCase() === `${ref.host}/${ref.owner}/${ref.repo}`.toLowerCase())
        if (disposed || !armed.has(sessionId) || version !== (versions.get(sessionId) ?? 0)
          || deps.getRegistry() !== registry || !current?.codingMode || current.isArchived
          || current.isProcessing || current.permissionMode === 'safe' || !currentMonitor?.autoFix
          || (deps.sessionManager.getSessionWorkingDirectory(sessionId) ?? current.workingDirectory) !== dir
          || !checkout?.branch || (checkout.remoteBranch ?? checkout.branch) !== entry.summary.headRef || !sameRepo) continue

        // Two Coding sessions can watch the same PR. Their local cursors and busy state prevent
        // duplicate/concurrent unattended fixes; manual turns keep their existing permissions.
        if (deps.sessionManager.getSessions().some(other => other.id !== sessionId && other.isProcessing && other.prMonitors?.[entry.id]?.autoFix)) continue
        if (!deps.sessionManager.wakeIdleSessionWithNotice(sessionId, autoFixMessage(entry.summary))) {
          lastCheckAt.delete(key) // became busy meanwhile: look again on the next push
          return
        }
        deps.sessionManager.recordPrAutoFixRun(sessionId, entry.id, [...new Set([...(monitor.lastFixSignature ?? []), ...signature])], at)
        registry.setSessionMonitors(sessionId, deps.sessionManager.getSessionPrMonitors(sessionId))
        log(`[pr-auto-fix] ${sessionId}: started a fix turn for ${entry.id} (${signature.length} feedback item(s))`)
        return // one fix turn at a time; other PRs are looked at after it ends
      }
    } finally {
      evaluating.delete(sessionId)
    }
  }

  return {
    sync,
    async armAll() {
      for (const session of deps.sessionManager.getSessions()) {
        if (session.prMonitors && Object.values(session.prMonitors).some(monitor => monitor.autoFix)) await sync(session.id)
      }
    },
    onState(sessionId, state) {
      if (disposed) return
      // A confirmed branch/PR change disarms the old target. Transient loading/network errors
      // aren't evidence of a change, so they keep the user's setting for retry/restart.
      if (state.kind === 'ready' || state.kind === 'none') {
        const branch = state.kind === 'ready' ? state.prs.find(entry => entry.origin === 'branch') : undefined
        let changed = false
        for (const [id, monitor] of Object.entries(deps.sessionManager.getSessionPrMonitors(sessionId))) {
          if (monitor.autoFix && (branch?.id !== id || branch.summary.state === 'closed' || branch.summary.state === 'merged')) {
            deps.sessionManager.setSessionPrAutoFix(sessionId, id, false)
            changed = true
          }
        }
        if (changed) {
          deps.getRegistry()?.setSessionMonitors(sessionId, deps.sessionManager.getSessionPrMonitors(sessionId))
          void sync(sessionId)
        }
      }
      void evaluate(sessionId, state).catch(error => log(`[pr-auto-fix] ${sessionId}: ${(error as Error).message}`))
    },
    armedSessions: () => [...armed.keys()],
    dispose() {
      disposed = true
      if (timer) clearTimer(timer)
      timer = undefined
      for (const sessionId of [...armed.keys()]) disarm(sessionId)
      lastCheckAt.clear()
      evaluating.clear()
      syncing.clear()
    },
  }
}
