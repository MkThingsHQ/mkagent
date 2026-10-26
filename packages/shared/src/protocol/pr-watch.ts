/**
 * PR watcher contract (Coding mode): what the workspace server's watcher pushes to the chat header's
 * PR chip and returns for its card. Pure types, safe to import from the renderer.
 *
 * Server: packages/server-core/src/services/pr-watch/. UI rules (chip status, card action, prompts):
 * apps/electron/src/renderer/components/app-shell/chat-header/pr-watch/pr-watch-state.ts.
 */

export type PrState = 'open' | 'draft' | 'merged' | 'closed'
/** GitHub's check rollup for the head commit; `none` when the commit has no checks. */
export type ChecksRollup = 'pending' | 'success' | 'failure' | 'none'
export type ReviewDecision = 'approved' | 'changes_requested' | 'review_required' | 'none'
/** GitHub's `mergeStateStatus`, collapsed to what the card says. */
export type MergeState = 'clean' | 'behind' | 'blocked' | 'conflicting' | 'unstable' | 'draft' | 'unknown'
export type CheckStatus = 'success' | 'failure' | 'pending' | 'skipped'
export type ReviewerState = 'approved' | 'changes_requested' | 'commented' | 'pending'

/**
 * What the poll fetches: everything the chip's status glyph and the card's action depend on, so the
 * two always agree (see {@link prCardAction}). One small GraphQL query.
 */
export interface PrSummary {
  number: number
  title: string
  url: string
  state: PrState
  headRef: string
  baseRef: string
  checks: ChecksRollup
  reviewDecision: ReviewDecision
  mergeState: MergeState
  /** Review threads not marked resolved */
  unresolvedThreads: number
  /** Local commits on the branch that the PR head doesn't have yet (local git, no GitHub call) */
  localAhead: number
  /** The working folder has uncommitted changes (local git) */
  localDirty: boolean
  /** Epoch ms of the fetch */
  fetchedAt: number
  /** Which credential answered ("gh", or the GitHub source's name): shown in the card footer */
  via: string
}

export interface PrCheck {
  name: string
  status: CheckStatus
  url?: string
}

export interface PrReviewer {
  login: string
  state: ReviewerState
}

export interface PrCommit {
  sha: string
  headline: string
  author: string
  /** Epoch ms */
  committedAt: number
}

/** What the card adds when it opens. */
export interface PrDetails {
  lastCommit: PrCommit
  checks: PrCheck[]
  reviewers: PrReviewer[]
  additions: number
  deletions: number
  changedFiles: number
}

export type PrWatchUnavailableReason = 'not-git' | 'not-github' | 'no-token' | 'error'

export type PrWatchState =
  /** First lookup in flight: renders nothing, like `none` */
  | { kind: 'loading' }
  /** The branch has no PR */
  | { kind: 'none' }
  | { kind: 'unavailable'; reason: PrWatchUnavailableReason }
  /** `details` is absent until the card has loaded them; `refreshing` while a refetch runs */
  | { kind: 'pr'; summary: PrSummary; details?: PrDetails; refreshing?: boolean }
