/**
 * The two GraphQL queries behind the PR watcher, and the response shapes `map-github.ts` reads.
 * Each costs 1 point of GitHub's 5,000/hour GraphQL budget (checked against a live PR).
 */

/**
 * The poll: everything the chip's status and the card's action depend on, for the branch's most
 * recently updated PRs (the caller picks one, see `pickPullRequest`).
 */
export const SUMMARY_QUERY = `query PrSummary($owner: String!, $name: String!, $branch: String!) {
  rateLimit { remaining resetAt }
  repository(owner: $owner, name: $name) {
    pullRequests(headRefName: $branch, states: [OPEN, MERGED, CLOSED], first: 5, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number title url state isDraft headRefName baseRefName headRefOid
        headRepositoryOwner { login }
        reviewDecision mergeable mergeStateStatus
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
        reviewThreads(first: 100) { nodes { isResolved } }
      }
    }
  }
}`

/** The card: last commit, every check context, reviewers, size. */
export const DETAILS_QUERY = `query PrDetails($owner: String!, $name: String!, $number: Int!) {
  rateLimit { remaining resetAt }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      additions deletions changedFiles
      commits(last: 1) { nodes { commit {
        oid messageHeadline committedDate
        author { name user { login } }
        statusCheckRollup { contexts(first: 100) { nodes {
          __typename
          ... on CheckRun { name status conclusion detailsUrl }
          ... on StatusContext { context state targetUrl }
        } } }
      } } }
      latestOpinionatedReviews(first: 20) { nodes { state author { login } } }
      reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { slug } ... on Bot { login } } } }
    }
  }
}`

export interface GqlRateLimit {
  remaining: number
  resetAt: string
}

export interface GqlPullRequestSummary {
  number: number
  title: string
  url: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  headRefName: string
  baseRefName: string
  headRefOid: string
  headRepositoryOwner: { login: string } | null
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  mergeStateStatus: 'BEHIND' | 'BLOCKED' | 'CLEAN' | 'DIRTY' | 'DRAFT' | 'HAS_HOOKS' | 'UNKNOWN' | 'UNSTABLE'
  commits: { nodes: Array<{ commit: { statusCheckRollup: { state: GqlRollupState } | null } }> }
  reviewThreads: { nodes: Array<{ isResolved: boolean }> }
}

export type GqlRollupState = 'EXPECTED' | 'ERROR' | 'FAILURE' | 'PENDING' | 'SUCCESS'

export interface GqlSummaryResponse {
  rateLimit: GqlRateLimit | null
  repository: { pullRequests: { nodes: GqlPullRequestSummary[] } } | null
}

export type GqlCheckContext =
  | { __typename: 'CheckRun'; name: string; status: string; conclusion: string | null; detailsUrl: string | null }
  | { __typename: 'StatusContext'; context: string; state: string; targetUrl: string | null }

export interface GqlPullRequestDetails {
  additions: number
  deletions: number
  changedFiles: number
  commits: {
    nodes: Array<{
      commit: {
        oid: string
        messageHeadline: string
        committedDate: string
        author: { name: string | null; user: { login: string } | null } | null
        statusCheckRollup: { contexts: { nodes: GqlCheckContext[] } } | null
      }
    }>
  }
  latestOpinionatedReviews: { nodes: Array<{ state: string; author: { login: string } | null }> }
  reviewRequests: {
    nodes: Array<{ requestedReviewer: { __typename: string; login?: string; slug?: string } | null }>
  }
}

export interface GqlDetailsResponse {
  rateLimit: GqlRateLimit | null
  repository: { pullRequest: GqlPullRequestDetails | null } | null
}
