import { describe, expect, it } from 'bun:test'
import type { GqlPullRequestDetails, GqlPullRequestSummary } from './github-queries'
import { mapCheck, mapDetails, mapMergeState, mapReviewers, mapRollup, mapSummary, pickPullRequest } from './map-github'

/** PR #479 as GitHub returned it (2026-10-18), the summary query's node. */
const PR_479: GqlPullRequestSummary = {
  number: 479,
  title: 'Add Coding mode + uplift Claude Agent SDK to 0.3.302',
  url: 'https://github.com/craft-ai-agents/craft-agents/pull/479',
  state: 'OPEN',
  isDraft: false,
  headRefName: 'feat/coding-mode',
  baseRefName: 'main',
  headRefOid: '769558f6e51beef1b09ef8772b2a67e1af15c050',
  headRepositoryOwner: { login: 'craft-ai-agents' },
  reviewDecision: null,
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
  reviewThreads: { nodes: [] },
}

/** PR #479's details query response (2026-10-18). */
const PR_479_DETAILS: GqlPullRequestDetails = {
  additions: 1125,
  deletions: 123,
  changedFiles: 60,
  commits: { nodes: [{ commit: {
    oid: '769558f6e51beef1b09ef8772b2a67e1af15c050',
    messageHeadline: 'chore(sdk): Claude Agent SDK 0.3.296 -> 0.3.302',
    committedDate: '2026-10-17T18:29:20Z',
    author: { name: 'Gyula Halmos', user: { login: 'rjulius23' } },
    statusCheckRollup: { contexts: { nodes: [
      { __typename: 'CheckRun', name: 'typecheck', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: 'https://github.com/craft-ai-agents/craft-agents/actions/runs/39058340690/job/117470854756' },
      { __typename: 'CheckRun', name: 'validate', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: 'https://github.com/craft-ai-agents/craft-agents/actions/runs/39058340687/job/117470854754' },
    ] } },
  } }] },
  latestOpinionatedReviews: { nodes: [] },
  reviewRequests: { nodes: [] },
}

const pr = (overrides: Partial<GqlPullRequestSummary>): GqlPullRequestSummary => ({ ...PR_479, ...overrides })

describe('mapSummary', () => {
  it('maps the live #479 response', () => {
    expect(mapSummary(PR_479, { localAhead: 2, localDirty: true }, { fetchedAt: 1000, via: 'gh' })).toEqual({
      number: 479,
      title: 'Add Coding mode + uplift Claude Agent SDK to 0.3.302',
      url: 'https://github.com/craft-ai-agents/craft-agents/pull/479',
      state: 'open',
      headRef: 'feat/coding-mode',
      baseRef: 'main',
      checks: 'success',
      reviewDecision: 'none',
      mergeState: 'clean',
      unresolvedThreads: 0,
      localAhead: 2,
      localDirty: true,
      fetchedAt: 1000,
      via: 'gh',
    })
  })

  it('maps states, drafts and unresolved threads', () => {
    const local = { localAhead: 0, localDirty: false }
    const meta = { fetchedAt: 0, via: 'gh' }
    expect(mapSummary(pr({ isDraft: true }), local, meta).state).toBe('draft')
    expect(mapSummary(pr({ state: 'MERGED' }), local, meta).state).toBe('merged')
    expect(mapSummary(pr({ state: 'CLOSED', isDraft: true }), local, meta).state).toBe('closed')
    expect(mapSummary(pr({ reviewThreads: { nodes: [{ isResolved: false }, { isResolved: true }, { isResolved: false }] } }), local, meta).unresolvedThreads).toBe(2)
    expect(mapSummary(pr({ commits: { nodes: [{ commit: { statusCheckRollup: null } }] } }), local, meta).checks).toBe('none')
    expect(mapSummary(pr({ reviewDecision: 'CHANGES_REQUESTED' }), local, meta).reviewDecision).toBe('changes_requested')
  })
})

describe('rollup and merge state', () => {
  it('collapses the check rollup', () => {
    expect(mapRollup('SUCCESS')).toBe('success')
    expect(mapRollup('ERROR')).toBe('failure')
    expect(mapRollup('EXPECTED')).toBe('pending')
    expect(mapRollup(null)).toBe('none')
  })

  it('treats CONFLICTING as authoritative and maps the rest', () => {
    expect(mapMergeState({ mergeable: 'CONFLICTING', mergeStateStatus: 'BLOCKED' })).toBe('conflicting')
    expect(mapMergeState({ mergeable: 'UNKNOWN', mergeStateStatus: 'DIRTY' })).toBe('conflicting')
    expect(mapMergeState({ mergeable: 'MERGEABLE', mergeStateStatus: 'HAS_HOOKS' })).toBe('clean')
    expect(mapMergeState({ mergeable: 'MERGEABLE', mergeStateStatus: 'BEHIND' })).toBe('behind')
    expect(mapMergeState({ mergeable: 'MERGEABLE', mergeStateStatus: 'DRAFT' })).toBe('draft')
    expect(mapMergeState({ mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' })).toBe('unknown')
  })
})

describe('pickPullRequest', () => {
  it('ignores same-named branches from other forks', () => {
    const fork = pr({ number: 10, headRepositoryOwner: { login: 'someone-else' } })
    expect(pickPullRequest([fork, PR_479], 'Craft-AI-Agents')?.number).toBe(479)
    expect(pickPullRequest([fork], 'craft-ai-agents')).toBeNull()
  })

  it('prefers an open PR over newer closed or merged ones', () => {
    const merged = pr({ number: 400, state: 'MERGED' })
    expect(pickPullRequest([merged, PR_479], 'craft-ai-agents')?.number).toBe(479)
    expect(pickPullRequest([merged], 'craft-ai-agents')?.number).toBe(400)
  })

  it('keeps PRs whose head repository was deleted', () => {
    expect(pickPullRequest([pr({ headRepositoryOwner: null })], 'anyone')?.number).toBe(479)
  })

  it('returns null when the branch has no PR', () => {
    expect(pickPullRequest([], 'craft-ai-agents')).toBeNull()
  })
})

describe('mapDetails', () => {
  it('maps the live #479 details', () => {
    expect(mapDetails(PR_479_DETAILS)).toEqual({
      lastCommit: {
        sha: '769558f6e51beef1b09ef8772b2a67e1af15c050',
        headline: 'chore(sdk): Claude Agent SDK 0.3.296 -> 0.3.302',
        author: 'Gyula Halmos',
        committedAt: Date.parse('2026-10-17T18:29:20Z'),
      },
      checks: [
        { name: 'typecheck', status: 'success', url: 'https://github.com/craft-ai-agents/craft-agents/actions/runs/39058340690/job/117470854756' },
        { name: 'validate', status: 'success', url: 'https://github.com/craft-ai-agents/craft-agents/actions/runs/39058340687/job/117470854754' },
      ],
      reviewers: [],
      additions: 1125,
      deletions: 123,
      changedFiles: 60,
    })
  })

  it('returns null without a commit', () => {
    expect(mapDetails({ ...PR_479_DETAILS, commits: { nodes: [] } })).toBeNull()
  })
})

describe('mapCheck', () => {
  it('maps check runs by status, then conclusion', () => {
    const run = (status: string, conclusion: string | null) => mapCheck({ __typename: 'CheckRun', name: 'ci', status, conclusion, detailsUrl: null }).status
    expect(run('IN_PROGRESS', null)).toBe('pending')
    expect(run('QUEUED', null)).toBe('pending')
    expect(run('COMPLETED', 'SUCCESS')).toBe('success')
    expect(run('COMPLETED', 'NEUTRAL')).toBe('success')
    expect(run('COMPLETED', 'FAILURE')).toBe('failure')
    expect(run('COMPLETED', 'TIMED_OUT')).toBe('failure')
    expect(run('COMPLETED', 'CANCELLED')).toBe('failure')
    expect(run('COMPLETED', 'SKIPPED')).toBe('skipped')
  })

  it('maps commit statuses', () => {
    const status = (state: string) => mapCheck({ __typename: 'StatusContext', context: 'ci/legacy', state, targetUrl: 'https://ci' })
    expect(status('SUCCESS')).toEqual({ name: 'ci/legacy', status: 'success', url: 'https://ci' })
    expect(status('ERROR').status).toBe('failure')
    expect(status('PENDING').status).toBe('pending')
  })
})

describe('mapReviewers', () => {
  it('keeps each reviewer once, lets a re-request win, and drops dismissed reviews', () => {
    expect(mapReviewers({
      latestOpinionatedReviews: { nodes: [
        { state: 'CHANGES_REQUESTED', author: { login: 'octocat' } },
        { state: 'APPROVED', author: { login: 'monalisa' } },
        { state: 'DISMISSED', author: { login: 'hubot' } },
      ] },
      reviewRequests: { nodes: [
        { requestedReviewer: { __typename: 'User', login: 'octocat' } },
        { requestedReviewer: { __typename: 'Team', slug: 'platform' } },
        { requestedReviewer: null },
      ] },
    })).toEqual([
      { login: 'octocat', state: 'pending' },
      { login: 'monalisa', state: 'approved' },
      { login: 'platform', state: 'pending' },
    ])
  })
})
