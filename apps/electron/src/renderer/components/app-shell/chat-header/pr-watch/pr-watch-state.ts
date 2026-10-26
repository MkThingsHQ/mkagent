/**
 * Coding-mode PR watcher: the state the chat header's PR chip renders, and the pure rules it
 * renders it by. The watcher never involves a model: the data comes from GitHub (a GitHub source's
 * token, else `gh auth token`) and local git, fetched on the workspace server.
 *
 * The data shapes are the server contract in `@mkagent/shared/protocol` (`pr-watch.ts`),
 * re-exported here; this file holds the UI's rules over them.
 */

import type { PrState, ChecksRollup, ReviewDecision, MergeState, PrSummary, PrCheck, PrDetails, PrWatchState } from '@mkagent/shared/protocol'

export type {
  PrState,
  ChecksRollup,
  ReviewDecision,
  MergeState,
  CheckStatus,
  ReviewerState,
  PrSummary,
  PrCheck,
  PrReviewer,
  PrCommit,
  PrDetails,
  PrWatchUnavailableReason,
  PrWatchState,
} from '@mkagent/shared/protocol'

/** Semantic tone; the components map it to role tokens (`merged` to GitHub's fixed purple). */
export type PrTone = 'success' | 'merged' | 'destructive' | 'info' | 'neutral'

/**
 * The chip renders only when the working folder is a git repo and its branch has a PR (open, draft,
 * merged or closed). Everything else — not a repo, no PR, not GitHub, no credential, first lookup
 * still running — renders nothing.
 */
export function isPrWatchVisible(state: PrWatchState | undefined): boolean {
  return state?.kind === 'pr'
}

/** GitHub's colors for PR states: open green, merged purple, closed and draft grey. */
export function prStateTone(state: PrState): PrTone {
  switch (state) {
    case 'open': return 'success'
    case 'merged': return 'merged'
    case 'closed':
    case 'draft': return 'neutral'
  }
}

export function checksTone(rollup: ChecksRollup): PrTone {
  switch (rollup) {
    case 'success': return 'success'
    case 'failure': return 'destructive'
    case 'pending': return 'info'
    case 'none': return 'neutral'
  }
}

export function reviewTone(decision: ReviewDecision): PrTone {
  switch (decision) {
    case 'approved': return 'success'
    case 'changes_requested': return 'destructive'
    case 'review_required':
    case 'none': return 'neutral'
  }
}

export function mergeTone(state: MergeState): PrTone {
  switch (state) {
    case 'clean': return 'success'
    case 'conflicting': return 'destructive'
    case 'behind':
    case 'blocked':
    case 'unstable': return 'info'
    case 'draft':
    case 'unknown': return 'neutral'
  }
}

export interface CheckCounts {
  passed: number
  failed: number
  running: number
  skipped: number
}

export function countChecks(checks: readonly PrCheck[]): CheckCounts {
  const counts: CheckCounts = { passed: 0, failed: 0, running: 0, skipped: 0 }
  for (const check of checks) {
    if (check.status === 'success') counts.passed++
    else if (check.status === 'failure') counts.failed++
    else if (check.status === 'pending') counts.running++
    else counts.skipped++
  }
  return counts
}

/** How many check rows the card lists before "+N more". */
export const CARD_CHECK_ROWS = 8

/**
 * The check rows worth a line in the card: failures first, then running checks, each group in
 * GitHub's order. Passed and skipped checks only count in the summary. `overflow` is how many
 * failing/running checks didn't fit.
 */
export function checkRowsForCard(checks: readonly PrCheck[], limit = CARD_CHECK_ROWS): { rows: PrCheck[]; overflow: number } {
  const attention = [
    ...checks.filter(check => check.status === 'failure'),
    ...checks.filter(check => check.status === 'pending'),
  ]
  return { rows: attention.slice(0, limit), overflow: Math.max(0, attention.length - limit) }
}

/** GitHub-style short sha. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

/**
 * The card footer's one action slot, by priority:
 * 1. `resolve`: merge conflicts (any other fix on a conflicted branch may have to be redone)
 * 2. `fix`: open review feedback (unresolved threads or a changes-requested review)
 * 3. `fix-ci`: failing checks (after review fixes, which re-run CI anyway)
 * 4. `unsynced`: an orange tick: nothing above applies, but uncommitted changes or unpushed commits
 *    aren't in the PR yet, so "all good" would describe a PR that isn't what's on disk
 * 5. `ok`: a green tick: checks passed (or there are none) and nothing above applies
 * `null` (empty slot) for merged/closed PRs and while checks still run.
 */
export type PrCardAction = 'resolve' | 'fix' | 'fix-ci' | 'unsynced' | 'ok'

export function prCardAction(summary: PrSummary): PrCardAction | null {
  if (summary.state === 'merged' || summary.state === 'closed') return null
  if (summary.mergeState === 'conflicting') return 'resolve'
  if (summary.unresolvedThreads > 0 || summary.reviewDecision === 'changes_requested') return 'fix'
  if (summary.checks === 'failure') return 'fix-ci'
  if (summary.checks === 'pending') return null
  return hasLocalChanges(summary) ? 'unsynced' : 'ok'
}

/** Local work the PR doesn't have yet: uncommitted changes or unpushed commits. */
export function hasLocalChanges(summary: PrSummary): boolean {
  return summary.localDirty || summary.localAhead > 0
}

/**
 * The chip's status glyph: the card's action (so a green tick in the chip always means the same as
 * the card's tick), or `pending` while checks run with nothing else to do. `null` for merged/closed.
 */
export type PrChipStatus = PrCardAction | 'pending'

export function prChipStatus(summary: PrSummary): PrChipStatus | null {
  if (summary.state === 'merged' || summary.state === 'closed') return null
  return prCardAction(summary) ?? (summary.checks === 'pending' ? 'pending' : null)
}

/**
 * The message the card's "Fix CI" button sends to the session: a fixed template (no model) naming the
 * failing checks with their links, and asking for the cause from the logs, a local fix and a re-run of
 * the same checks. Kept local like the others.
 */
export function fixChecksMessage(summary: PrSummary, details: PrDetails | undefined): string {
  const failing = details?.checks.filter(check => check.status === 'failure') ?? []
  const list = failing.map(check => `- ${check.name}${check.url ? ` (${check.url})` : ''}`)
  return [
    `Fix the failing CI checks on pull request #${summary.number} (${summary.url})${failing.length ? ':' : '.'}`,
    ...list,
    '',
    `1. Read why they failed with the GitHub CLI: \`gh pr checks ${summary.url}\`, then \`gh run view <run-id> --log-failed\` for each failed run.`,
    `2. Reproduce each failure locally on \`${summary.headRef}\` and fix the cause, not the symptom. If a failure is flaky or unrelated to this branch, say so instead of changing code.`,
    '3. Run the same checks locally until they pass.',
    '4. Summarize the cause and the fix for each check.',
    '',
    "Don't push unless I ask.",
  ].join('\n')
}

/** The prompt for an action button; the ticks (`ok`, `unsynced`) send nothing. */
export function prCardActionMessage(action: PrCardAction, summary: PrSummary, details: PrDetails | undefined): string | null {
  switch (action) {
    case 'resolve': return resolveConflictsMessage(summary)
    case 'fix': return fixReviewMessage(summary, details)
    case 'fix-ci': return fixChecksMessage(summary, details)
    case 'unsynced':
    case 'ok': return null
  }
}

/**
 * The message the card's "Resolve" button sends to the session: a fixed template (no model). It asks
 * for a merge of the base branch (never a rebase, which would need a force-push), conflicts resolved
 * by intent, tests, and a per-file summary, and keeps it local.
 */
export function resolveConflictsMessage(summary: PrSummary): string {
  return [
    `Resolve the merge conflicts between \`${summary.headRef}\` and \`${summary.baseRef}\` on pull request #${summary.number} (${summary.url}).`,
    '',
    `1. Fetch \`origin/${summary.baseRef}\` and merge it into \`${summary.headRef}\`. Don't rebase.`,
    "2. Resolve each conflict keeping the intent of both sides. If a conflict needs a decision only I can make, stop and ask.",
    '3. Run the relevant tests and type checks.',
    '4. Commit the merge and summarize how you resolved each file.',
    '',
    "Don't push unless I ask.",
  ].join('\n')
}

/**
 * The message the card's "Fix" button sends to the session: a fixed template, so the shortcut never
 * involves a model. It points the agent at the PR's unresolved threads (read with the GitHub CLI),
 * asks for the changes, tests and a per-comment summary, and keeps it local: no push, no replies.
 */
export function fixReviewMessage(summary: PrSummary, details: PrDetails | undefined): string {
  const feedback: string[] = []
  if (summary.unresolvedThreads > 0) {
    feedback.push(`${summary.unresolvedThreads} unresolved review thread${summary.unresolvedThreads === 1 ? '' : 's'}`)
  }
  const requesters = details?.reviewers.filter(reviewer => reviewer.state === 'changes_requested').map(reviewer => `@${reviewer.login}`) ?? []
  if (requesters.length > 0) feedback.push(`changes requested by ${requesters.join(', ')}`)
  else if (summary.reviewDecision === 'changes_requested') feedback.push('changes requested')

  return [
    `Fix the open review comments on pull request #${summary.number} (${summary.url})${feedback.length ? `: ${feedback.join('; ')}` : ''}.`,
    '',
    `1. Read the review feedback with the GitHub CLI: \`gh pr view ${summary.url} --comments\` for the reviews, and the GraphQL \`reviewThreads\` of the PR (only \`isResolved: false\`) for the inline comments.`,
    `2. Make the changes each comment asks for on \`${summary.headRef}\`. If a comment is unclear or you disagree with it, say so instead of guessing.`,
    '3. Run the relevant tests and type checks.',
    '4. Summarize what you changed for each comment.',
    '',
    "Don't push, reply on GitHub or resolve threads unless I ask.",
  ].join('\n')
}
