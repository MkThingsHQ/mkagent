/**
 * Minimal GitHub GraphQL client for the PR watcher: one POST, a timeout, and errors classified so
 * the token chain knows whether to try the next credential (`GitHubAuthError`) or back off
 * (`GitHubRequestError`, with `retryAfterMs` for rate limits).
 */

import { graphqlEndpoint } from './remote-url'

const REQUEST_TIMEOUT_MS = 10_000
const USER_AGENT = 'mkagent-pr-watch'

/** This credential can't see the repository: 401, a 403 that isn't a rate limit, or NOT_FOUND. */
export class GitHubAuthError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'GitHubAuthError'
  }
}

/** Network, 5xx or rate limit: retry later with the same credential. */
export class GitHubRequestError extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfterMs?: number) {
    super(message)
    this.name = 'GitHubRequestError'
  }
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
}>

interface GraphqlBody<T> {
  data?: T
  errors?: Array<{ type?: string; message?: string }>
}

export async function githubGraphql<T>(
  host: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
  { fetch: doFetch = fetch as unknown as FetchLike, timeoutMs = REQUEST_TIMEOUT_MS }: { fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Awaited<ReturnType<FetchLike>>
  try {
    response = await doFetch(graphqlEndpoint(host), {
      method: 'POST',
      headers: {
        Authorization: `bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    })
  } catch (error) {
    throw new GitHubRequestError(controller.signal.aborted ? 'GitHub request timed out' : `GitHub request failed: ${(error as Error).message}`)
  } finally {
    clearTimeout(timer)
  }

  const retryAfter = Number(response.headers.get('retry-after'))
  const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined
  if (response.status === 401) throw new GitHubAuthError('GitHub rejected the credential', 401)
  if (response.status === 403 || response.status === 429) {
    // Secondary rate limits come as 403 with Retry-After or x-ratelimit-remaining: 0
    if (retryAfterMs !== undefined || response.headers.get('x-ratelimit-remaining') === '0' || response.status === 429) {
      throw new GitHubRequestError('GitHub rate limit', response.status, retryAfterMs ?? 60_000)
    }
    throw new GitHubAuthError('GitHub denied access', 403)
  }
  if (!response.ok) throw new GitHubRequestError(`GitHub responded ${response.status}`, response.status, retryAfterMs)

  const body = (await response.json()) as GraphqlBody<T>
  if (body.errors?.some(error => error.type === 'NOT_FOUND' || error.type === 'FORBIDDEN')) {
    // Private repo this credential can't see (e.g. an org that restricts OAuth apps)
    throw new GitHubAuthError(body.errors.map(error => error.message).join('; ') || 'Repository not found')
  }
  if (body.errors?.some(error => error.type === 'RATE_LIMITED')) {
    throw new GitHubRequestError('GitHub rate limit', 200, retryAfterMs ?? 60_000)
  }
  if (!body.data) throw new GitHubRequestError(body.errors?.map(error => error.message).join('; ') || 'GitHub returned no data')
  return body.data
}
