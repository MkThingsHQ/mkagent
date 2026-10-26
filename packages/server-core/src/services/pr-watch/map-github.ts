/**
 * GitHub GraphQL responses → the PR watcher contract (`@mkagent/shared/protocol` pr-watch).
 * Pure, so every mapping rule is unit-tested against recorded responses.
 */

import type {
  CheckStatus,
  ChecksRollup,
  MergeState,
  PrCheck,
  PrDetails,
  PrReviewer,
  PrState,
  PrSummary,
  ReviewDecision,
  ReviewerState,
} from '@mkagent/shared/protocol'
import type { GqlCheckContext, GqlPullRequestDetails, GqlPullRequestSummary, GqlRollupState } from './github-queries'

/**
 * The branch's PR among GitHub's matches (newest first): `headRefName` alone also matches same-named
 * branches pushed from other forks, so only PRs whose head lives in `headOwner` count (a deleted head
 * repo reports no owner and is kept). An open PR wins over newer closed/merged ones.
 */
export function pickPullRequest(nodes: readonly GqlPullRequestSummary[], headOwner: string): GqlPullRequestSummary | null {
  const owner = headOwner.toLowerCase()
  const ours = nodes.filter(node => !node.headRepositoryOwner || node.headRepositoryOwner.login.toLowerCase() === owner)
  return ours.find(node => node.state === 'OPEN') ?? ours[0] ?? null
}

export function mapPrState(node: Pick<GqlPullRequestSummary, 'state' | 'isDraft'>): PrState {
  if (node.state === 'MERGED') return 'merged'
  if (node.state === 'CLOSED') return 'closed'
  return node.isDraft ? 'draft' : 'open'
}

export function mapRollup(state: GqlRollupState | null | undefined): ChecksRollup {
  switch (state) {
    case 'SUCCESS': return 'success'
    case 'FAILURE':
    case 'ERROR': return 'failure'
    case 'PENDING':
    case 'EXPECTED': return 'pending'
    default: return 'none'
  }
}

export function mapReviewDecision(decision: GqlPullRequestSummary['reviewDecision']): ReviewDecision {
  switch (decision) {
    case 'APPROVED': return 'approved'
    case 'CHANGES_REQUESTED': return 'changes_requested'
    case 'REVIEW_REQUIRED': return 'review_required'
    default: return 'none'
  }
}

/** `mergeable: CONFLICTING` is authoritative for conflicts; `mergeStateStatus` says the rest. */
export function mapMergeState(node: Pick<GqlPullRequestSummary, 'mergeable' | 'mergeStateStatus'>): MergeState {
  if (node.mergeable === 'CONFLICTING' || node.mergeStateStatus === 'DIRTY') return 'conflicting'
  switch (node.mergeStateStatus) {
    case 'CLEAN':
    case 'HAS_HOOKS': return 'clean'
    case 'BEHIND': return 'behind'
    case 'BLOCKED': return 'blocked'
    case 'UNSTABLE': return 'unstable'
    case 'DRAFT': return 'draft'
    default: return 'unknown'
  }
}

export interface LocalStatus {
  localAhead: number
  localDirty: boolean
}

export function mapSummary(node: GqlPullRequestSummary, local: LocalStatus, meta: { fetchedAt: number; via: string }): PrSummary {
  return {
    number: node.number,
    title: node.title,
    url: node.url,
    state: mapPrState(node),
    headRef: node.headRefName,
    baseRef: node.baseRefName,
    checks: mapRollup(node.commits.nodes[0]?.commit.statusCheckRollup?.state),
    reviewDecision: mapReviewDecision(node.reviewDecision),
    mergeState: mapMergeState(node),
    unresolvedThreads: node.reviewThreads.nodes.filter(thread => !thread.isResolved).length,
    localAhead: local.localAhead,
    localDirty: local.localDirty,
    fetchedAt: meta.fetchedAt,
    via: meta.via,
  }
}

const FAILED_CONCLUSIONS = new Set(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])

export function mapCheck(context: GqlCheckContext): PrCheck {
  if (context.__typename === 'CheckRun') {
    let status: CheckStatus
    if (context.status !== 'COMPLETED') status = 'pending'
    else if (context.conclusion && FAILED_CONCLUSIONS.has(context.conclusion)) status = 'failure'
    else if (context.conclusion === 'SKIPPED' || context.conclusion === 'STALE') status = 'skipped'
    else status = 'success'
    return { name: context.name, status, url: context.detailsUrl ?? undefined }
  }
  const status: CheckStatus = context.state === 'SUCCESS'
    ? 'success'
    : context.state === 'FAILURE' || context.state === 'ERROR' ? 'failure' : 'pending'
  return { name: context.context, status, url: context.targetUrl ?? undefined }
}

const REVIEW_STATE: Record<string, ReviewerState> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
  COMMENTED: 'commented',
}

/**
 * Each reviewer once: their latest opinionated review, overridden by a pending request (a re-request
 * after a review means they are expected to look again). Dismissed reviews drop out.
 */
export function mapReviewers(details: Pick<GqlPullRequestDetails, 'latestOpinionatedReviews' | 'reviewRequests'>): PrReviewer[] {
  const byLogin = new Map<string, ReviewerState>()
  for (const review of details.latestOpinionatedReviews.nodes) {
    const state = REVIEW_STATE[review.state]
    if (review.author && state) byLogin.set(review.author.login, state)
  }
  for (const request of details.reviewRequests.nodes) {
    const name = request.requestedReviewer?.login ?? request.requestedReviewer?.slug
    if (name) byLogin.set(name, 'pending')
  }
  return [...byLogin].map(([login, state]) => ({ login, state }))
}

export function mapDetails(details: GqlPullRequestDetails): PrDetails | null {
  const commit = details.commits.nodes[0]?.commit
  if (!commit) return null
  return {
    lastCommit: {
      sha: commit.oid,
      headline: commit.messageHeadline,
      author: commit.author?.name ?? commit.author?.user?.login ?? 'unknown',
      committedAt: Date.parse(commit.committedDate),
    },
    checks: (commit.statusCheckRollup?.contexts.nodes ?? []).map(mapCheck),
    reviewers: mapReviewers(details),
    additions: details.additions,
    deletions: details.deletions,
    changedFiles: details.changedFiles,
  }
}
