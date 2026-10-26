/**
 * PR watcher registry: one watcher per checkout + branch, shared by every subscription on it
 * (several panels/windows, several sessions in one folder), polling on the adaptive schedule and
 * refreshing at once on triggers. Pushes a state only when it changed.
 *
 * Gating (the chip's rule: a git repo whose branch has a PR) happens before any GitHub call: a folder
 * that isn't a repo, a detached HEAD or a non-GitHub remote never creates a watcher.
 */

import type { PrDetails, PrSummary, PrWatchState } from '@mkagent/shared/protocol'
import { DETAILS_QUERY, SUMMARY_QUERY, type GqlDetailsResponse, type GqlSummaryResponse } from './github-queries'
import { GitHubRequestError } from './github-client'
import { localStatus as defaultLocalStatus, resolveRepo as defaultResolveRepo, watchRefs as defaultWatchRefs, type LocalStatus, type RepoInfo } from './local-git'
import { mapDetails, mapSummary, pickPullRequest } from './map-github'
import type { RepoCoordinates } from './remote-url'
import { nextPollDelay } from './schedule'
import { TokenChain, type TokenCandidate } from './token-chain'

/** Details are cached this long, so a card re-asking every 15 s costs at most one query. */
const DETAILS_TTL_MS = 10_000
/** Even an unchanged state is re-pushed this often, so the card's "Updated Xs ago" stays honest. */
const MAX_SILENT_MS = 60_000

export interface PrWatchDeps {
  /** GitHub GraphQL call; throws GitHubAuthError / GitHubRequestError */
  graphql<T>(host: string, token: string, query: string, variables: Record<string, unknown>): Promise<T>
  /** Credentials to try for a host, in order */
  candidates(host: string, workspaceRootPath: string): Promise<TokenCandidate[]>
  /** Delivers a state to one client for one session */
  push(clientId: string, sessionId: string, state: PrWatchState): void
  resolveRepo?: (dir: string) => Promise<RepoInfo | null>
  localStatus?: (dir: string, prHeadOid: string | null) => Promise<LocalStatus>
  watchRefs?: (repo: RepoInfo, onChange: () => void) => () => void
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  log?: (message: string) => void
}

interface Subscription {
  id: string
  clientId: string
  sessionId: string
  dir: string
  workspaceRootPath: string
  /** null while the folder can't have a PR (not a repo, detached, not GitHub) */
  watcherKey: string | null
  /** The state for subscriptions without a watcher */
  state: PrWatchState
}

interface Watcher {
  key: string
  repo: RepoInfo & { repo: RepoCoordinates; branch: string; remoteBranch: string }
  workspaceRootPath: string
  subscriptions: Set<string>
  state: PrWatchState
  /** The repository and number of the PR the state describes (the push remote's or upstream's) */
  pr: { coords: RepoCoordinates; number: number; headOid: string } | null
  lastChangeAt: number
  lastPushAt: number
  consecutiveErrors: number
  rateLimit?: { remaining: number; resetAt: number }
  retryAfterUntil?: number
  timer: unknown
  inFlight: Promise<void> | null
  stopRefWatch: () => void
  details: { at: number; value: PrDetails | null } | null
}

type WatchableRepo = Watcher['repo']

function isWatchable(repo: RepoInfo): repo is WatchableRepo {
  return !!repo.branch && !!repo.remoteBranch && !!repo.repo
}

function keyOf(repo: WatchableRepo): string {
  return `${repo.root}|${repo.repo.host}/${repo.repo.owner}/${repo.repo.repo}@${repo.remoteBranch}`
}

function coordsKey(coords: RepoCoordinates): string {
  return `${coords.host}/${coords.owner}/${coords.repo}`
}

/** Equal for the UI: everything but `fetchedAt`. */
function sameState(a: PrWatchState, b: PrWatchState): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'unavailable' && b.kind === 'unavailable') return a.reason === b.reason
  if (a.kind === 'pr' && b.kind === 'pr') {
    const strip = ({ fetchedAt: _fetchedAt, ...rest }: PrSummary) => JSON.stringify(rest)
    return strip(a.summary) === strip(b.summary)
  }
  return true
}

export class PrWatchRegistry {
  private readonly subscriptions = new Map<string, Subscription>()
  private readonly watchers = new Map<string, Watcher>()
  private readonly chain: TokenChain
  private nextId = 1

  private readonly resolveRepo: NonNullable<PrWatchDeps['resolveRepo']>
  private readonly localStatus: NonNullable<PrWatchDeps['localStatus']>
  private readonly watchRefs: NonNullable<PrWatchDeps['watchRefs']>
  private readonly now: () => number
  private readonly setTimer: NonNullable<PrWatchDeps['setTimer']>
  private readonly clearTimer: NonNullable<PrWatchDeps['clearTimer']>
  private readonly log: (message: string) => void

  constructor(private readonly deps: PrWatchDeps) {
    this.resolveRepo = deps.resolveRepo ?? defaultResolveRepo
    this.localStatus = deps.localStatus ?? defaultLocalStatus
    this.watchRefs = deps.watchRefs ?? defaultWatchRefs
    this.now = deps.now ?? Date.now
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = deps.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>))
    this.log = deps.log ?? (() => {})
    this.chain = new TokenChain(this.now)
  }

  /** Starts watching a session's folder for one client. Returns the current state (often `loading`). */
  async subscribe(input: { clientId: string; sessionId: string; dir: string; workspaceRootPath: string }): Promise<{ subscriptionId: string; state: PrWatchState }> {
    const subscription: Subscription = { id: `prw-${this.nextId++}`, ...input, watcherKey: null, state: { kind: 'loading' } }
    this.subscriptions.set(subscription.id, subscription)
    await this.attach(subscription)
    return { subscriptionId: subscription.id, state: this.stateOf(subscription) }
  }

  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId)
    if (!subscription) return
    this.subscriptions.delete(subscriptionId)
    this.detach(subscription)
  }

  /** A client went away: drop all of its subscriptions. */
  dropClient(clientId: string): void {
    for (const subscription of [...this.subscriptions.values()]) {
      if (subscription.clientId === clientId) this.unsubscribe(subscription.id)
    }
  }

  /**
   * Something may have changed for a session (agent turn ended, Refresh): re-resolve its folder
   * (branch switches, `git init`, a new remote) and refetch at once.
   */
  async nudge(sessionId: string, clientId?: string): Promise<void> {
    await this.reattach([...this.subscriptions.values()].filter(s => s.sessionId === sessionId && (!clientId || s.clientId === clientId)))
  }

  /** The card's details for a session (cached briefly); also refreshes the local ahead/dirty state. */
  async getDetails(sessionId: string, clientId: string): Promise<PrDetails | null> {
    const subscription = [...this.subscriptions.values()].find(s => s.sessionId === sessionId && s.clientId === clientId && s.watcherKey)
    const watcher = subscription?.watcherKey ? this.watchers.get(subscription.watcherKey) : undefined
    if (!watcher?.pr) return null
    if (watcher.details && this.now() - watcher.details.at < DETAILS_TTL_MS) return watcher.details.value

    const { coords, number, headOid } = watcher.pr
    const [response, local] = await Promise.all([
      this.withToken(watcher, coords, token => this.deps.graphql<GqlDetailsResponse>(coords.host, token, DETAILS_QUERY, { owner: coords.owner, name: coords.repo, number })).catch(() => null),
      this.localStatus(watcher.repo.root, headOid),
    ])
    this.updateLocal(watcher, local)
    const raw = response?.result.repository?.pullRequest
    const value = raw ? mapDetails(raw) : null
    watcher.details = { at: this.now(), value }
    return value
  }

  /** Stops every watcher (server shutdown). */
  dispose(): void {
    for (const watcher of this.watchers.values()) this.stopWatcher(watcher)
    this.watchers.clear()
    this.subscriptions.clear()
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private stateOf(subscription: Subscription): PrWatchState {
    return subscription.watcherKey ? this.watchers.get(subscription.watcherKey)?.state ?? subscription.state : subscription.state
  }

  /** Re-resolves subscriptions; those still on the same watcher get one refetch per watcher. */
  private async reattach(targets: Subscription[]): Promise<void> {
    const refreshed = new Set<string>()
    for (const subscription of targets) {
      const before = subscription.watcherKey
      await this.attach(subscription)
      const key = subscription.watcherKey
      if (key && key === before && !refreshed.has(key)) {
        refreshed.add(key)
        const watcher = this.watchers.get(key)
        if (watcher) await this.refresh(watcher)
      }
    }
  }

  /** Resolves the subscription's folder and (re)binds it to the right watcher, or to a gated state. */
  private async attach(subscription: Subscription): Promise<void> {
    const repo = await this.resolveRepo(subscription.dir)
    if (!this.subscriptions.has(subscription.id)) return

    if (!repo || !isWatchable(repo)) {
      this.detach(subscription)
      const state: PrWatchState = !repo
        ? { kind: 'unavailable', reason: 'not-git' }
        : !repo.branch ? { kind: 'none' } : { kind: 'unavailable', reason: 'not-github' }
      const changed = !sameState(subscription.state, state)
      subscription.state = state
      if (changed) this.deps.push(subscription.clientId, subscription.sessionId, state)
      return
    }

    const key = keyOf(repo)
    if (subscription.watcherKey === key) return
    this.detach(subscription)
    subscription.watcherKey = key
    let watcher = this.watchers.get(key)
    if (!watcher) {
      watcher = this.createWatcher(key, repo, subscription.workspaceRootPath)
      watcher.subscriptions.add(subscription.id)
      void this.refresh(watcher)
    } else {
      watcher.subscriptions.add(subscription.id)
      // A newcomer (a window shown again, a second panel) gets the current state now
      if (watcher.state.kind !== 'loading') this.deps.push(subscription.clientId, subscription.sessionId, watcher.state)
    }
  }

  private detach(subscription: Subscription): void {
    const key = subscription.watcherKey
    if (!key) return
    subscription.watcherKey = null
    const watcher = this.watchers.get(key)
    if (!watcher) return
    watcher.subscriptions.delete(subscription.id)
    if (watcher.subscriptions.size === 0) {
      this.stopWatcher(watcher)
      this.watchers.delete(key)
    }
  }

  private createWatcher(key: string, repo: WatchableRepo, workspaceRootPath: string): Watcher {
    const watcher: Watcher = {
      key,
      repo,
      workspaceRootPath,
      subscriptions: new Set(),
      state: { kind: 'loading' },
      pr: null,
      lastChangeAt: this.now(),
      lastPushAt: 0,
      consecutiveErrors: 0,
      timer: null,
      inFlight: null,
      stopRefWatch: () => {},
      details: null,
    }
    // A commit, checkout or push moves a ref: re-resolve (the branch may have changed) and refetch
    watcher.stopRefWatch = this.watchRefs(repo, () => {
      const targets = [...watcher.subscriptions].map(id => this.subscriptions.get(id)).filter((s): s is Subscription => !!s)
      void this.reattach(targets)
    })
    this.watchers.set(key, watcher)
    return watcher
  }

  private stopWatcher(watcher: Watcher): void {
    if (watcher.timer !== null) this.clearTimer(watcher.timer)
    watcher.timer = null
    watcher.stopRefWatch()
  }

  private async withToken<T>(watcher: Watcher, coords: RepoCoordinates, attempt: (token: string) => Promise<T>): Promise<{ result: T; via: string } | null> {
    const candidates = await this.deps.candidates(coords.host, watcher.workspaceRootPath)
    return this.chain.run(coordsKey(coords), candidates, attempt)
  }

  /** One summary fetch; concurrent callers share it. */
  private refresh(watcher: Watcher): Promise<void> {
    if (watcher.inFlight) return watcher.inFlight
    if (watcher.timer !== null) {
      this.clearTimer(watcher.timer)
      watcher.timer = null
    }
    watcher.inFlight = this.fetchSummary(watcher).finally(() => {
      watcher.inFlight = null
      if (this.watchers.get(watcher.key) === watcher) this.schedule(watcher)
    })
    return watcher.inFlight
  }

  private async fetchSummary(watcher: Watcher): Promise<void> {
    const { repo } = watcher
    try {
      const query = async (coords: RepoCoordinates) => {
        const response = await this.withToken(watcher, coords, token =>
          this.deps.graphql<GqlSummaryResponse>(coords.host, token, SUMMARY_QUERY, { owner: coords.owner, name: coords.repo, branch: repo.remoteBranch }))
        if (!response) return null
        const limit = response.result.rateLimit
        if (limit) watcher.rateLimit = { remaining: limit.remaining, resetAt: Date.parse(limit.resetAt) }
        const node = pickPullRequest(response.result.repository?.pullRequests.nodes ?? [], repo.repo.owner)
        return { node, via: response.via, coords }
      }

      let found = await query(repo.repo)
      // Fork workflow: the PR lives on the upstream repository, opened from our fork's branch
      if (found && !found.node && repo.upstreamRepo && repo.upstreamRepo.host === repo.repo.host) {
        found = (await query(repo.upstreamRepo)) ?? found
      }

      watcher.consecutiveErrors = 0
      watcher.retryAfterUntil = undefined
      if (!found) {
        watcher.pr = null
        this.setState(watcher, { kind: 'unavailable', reason: 'no-token' })
        return
      }
      if (!found.node) {
        watcher.pr = null
        this.setState(watcher, { kind: 'none' })
        return
      }
      const node = found.node
      const local = await this.localStatus(repo.root, node.headRefOid)
      if (watcher.pr?.number !== node.number || watcher.pr.headOid !== node.headRefOid) watcher.details = null
      watcher.pr = { coords: found.coords, number: node.number, headOid: node.headRefOid }
      this.setState(watcher, { kind: 'pr', summary: mapSummary(node, local, { fetchedAt: this.now(), via: found.via }) })
    } catch (error) {
      watcher.consecutiveErrors++
      if (error instanceof GitHubRequestError && error.retryAfterMs) watcher.retryAfterUntil = this.now() + error.retryAfterMs
      this.log(`[pr-watch] ${watcher.key}: ${(error as Error).message}`)
      // Keep the last good state (its fetchedAt ages in the card); a failing first fetch hides the chip
      if (watcher.state.kind === 'loading') this.setState(watcher, { kind: 'unavailable', reason: 'error' })
    }
  }

  private updateLocal(watcher: Watcher, local: LocalStatus): void {
    if (watcher.state.kind !== 'pr') return
    const { summary } = watcher.state
    if (summary.localAhead === local.localAhead && summary.localDirty === local.localDirty) return
    this.setState(watcher, { ...watcher.state, summary: { ...summary, ...local } })
  }

  private setState(watcher: Watcher, state: PrWatchState): void {
    const changed = !sameState(watcher.state, state)
    watcher.state = state
    const now = this.now()
    if (changed) watcher.lastChangeAt = now
    if (!changed && now - watcher.lastPushAt < MAX_SILENT_MS) return
    watcher.lastPushAt = now
    // One push per client + session, however many subscriptions it holds
    const delivered = new Set<string>()
    for (const id of watcher.subscriptions) {
      const subscription = this.subscriptions.get(id)
      if (!subscription) continue
      const target = `${subscription.clientId}|${subscription.sessionId}`
      if (delivered.has(target)) continue
      delivered.add(target)
      this.deps.push(subscription.clientId, subscription.sessionId, state)
    }
  }

  private schedule(watcher: Watcher): void {
    if (watcher.subscriptions.size === 0) return
    const now = this.now()
    let delay = nextPollDelay({
      state: watcher.state,
      now,
      lastChangeAt: watcher.lastChangeAt,
      consecutiveErrors: watcher.consecutiveErrors,
      rateLimit: watcher.rateLimit,
    })
    if (delay === null) return
    if (watcher.retryAfterUntil && watcher.retryAfterUntil > now) delay = Math.max(delay, watcher.retryAfterUntil - now)
    watcher.timer = this.setTimer(() => {
      watcher.timer = null
      void this.refresh(watcher)
    }, delay)
  }
}
