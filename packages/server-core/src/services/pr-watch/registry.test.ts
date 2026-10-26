import { describe, expect, it } from 'bun:test'
import type { PrWatchState } from '@mkagent/shared/protocol'
import { GitHubRequestError } from './github-client'
import type { GqlPullRequestSummary } from './github-queries'
import type { LocalStatus, RepoInfo } from './local-git'
import { PrWatchRegistry, type PrWatchDeps } from './registry'
import { POLL } from './schedule'

const REPO: RepoInfo = {
  root: '/work/app',
  gitDir: '/work/app/.git',
  commonDir: '/work/app/.git',
  branch: 'feat/x',
  pushRemote: 'origin',
  remoteBranch: 'feat/x',
  repo: { host: 'github.com', owner: 'acme', repo: 'app' },
  upstreamRepo: null,
}

const PR: GqlPullRequestSummary = {
  number: 7, title: 'Feature X', url: 'https://github.com/acme/app/pull/7', state: 'OPEN', isDraft: false,
  headRefName: 'feat/x', baseRefName: 'main', headRefOid: 'abc', headRepositoryOwner: { login: 'acme' },
  reviewDecision: null, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN',
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
  reviewThreads: { nodes: [] },
}

function setup(options: { repos?: Record<string, RepoInfo | null>; prs?: GqlPullRequestSummary[]; local?: LocalStatus } = {}) {
  let now = 1_000_000
  let nextTimer = 1
  const timers = new Map<number, { at: number; fn: () => void }>()
  const pushes: Array<{ clientId: string; sessionId: string; state: PrWatchState }> = []
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = []
  const refWatchers = new Map<string, () => void>()
  let stoppedRefWatchers = 0
  const repos: Record<string, RepoInfo | null> = { '/work/app': REPO, ...options.repos }
  let prs = options.prs ?? [PR]
  let failNext: Error | null = null
  let local = options.local ?? { localAhead: 0, localDirty: false }

  const deps: PrWatchDeps = {
    graphql: async <T,>(_host: string, _token: string, query: string, variables: Record<string, unknown>) => {
      calls.push({ query, variables })
      if (failNext) {
        const error = failNext
        failNext = null
        throw error
      }
      if (query.includes('PrDetails')) {
        return {
          rateLimit: null,
          repository: { pullRequest: {
            additions: 1, deletions: 2, changedFiles: 3,
            commits: { nodes: [{ commit: { oid: 'abc', messageHeadline: 'h', committedDate: '2026-10-17T00:00:00Z', author: { name: 'A', user: null }, statusCheckRollup: null } }] },
            latestOpinionatedReviews: { nodes: [] },
            reviewRequests: { nodes: [] },
          } },
        } as T
      }
      return { rateLimit: { remaining: 4000, resetAt: '2030-01-01T00:00:00Z' }, repository: { pullRequests: { nodes: prs } } } as T
    },
    candidates: async () => [{ id: 'gh', label: 'gh', getToken: async () => 'token' }],
    push: (clientId, sessionId, state) => pushes.push({ clientId, sessionId, state }),
    resolveRepo: async dir => repos[dir] ?? null,
    localStatus: async () => local,
    watchRefs: (repo, onChange) => {
      refWatchers.set(repo.root, onChange)
      return () => { stoppedRefWatchers++ }
    },
    now: () => now,
    setTimer: (fn, ms) => {
      const id = nextTimer++
      timers.set(id, { at: now + ms, fn })
      return id
    },
    clearTimer: handle => { timers.delete(handle as number) },
  }
  const registry = new PrWatchRegistry(deps)
  const flush = () => new Promise(r => setTimeout(r, 0))
  return {
    registry, pushes, calls, timers, refWatchers, repos,
    get stoppedRefWatchers() { return stoppedRefWatchers },
    setPrs: (next: GqlPullRequestSummary[]) => { prs = next },
    setLocal: (next: LocalStatus) => { local = next },
    failNextWith: (error: Error) => { failNext = error },
    flush,
    /** Advances the clock and runs due timers */
    async advance(ms: number) {
      now += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at > now) continue
        timers.delete(id)
        timer.fn()
      }
      await flush()
      await flush()
    },
    nextDelay: () => Math.min(...[...timers.values()].map(t => t.at - now)),
  }
}

const sub = (sessionId = 's1', clientId = 'c1', dir = '/work/app') => ({ clientId, sessionId, dir, workspaceRootPath: '/ws' })

describe('PrWatchRegistry gating', () => {
  it('never asks GitHub for a folder that is not a git repo', async () => {
    const t = setup({ repos: { '/tmp/notes': null } })
    const { state } = await t.registry.subscribe(sub('s1', 'c1', '/tmp/notes'))
    expect(state).toEqual({ kind: 'unavailable', reason: 'not-git' })
    expect(t.calls).toHaveLength(0)
    expect(t.timers.size).toBe(0)
  })

  it('shows nothing on a detached HEAD or a non-GitHub remote, without calls', async () => {
    const t = setup({ repos: {
      '/work/detached': { ...REPO, root: '/work/detached', branch: null, remoteBranch: null },
      '/work/gitlab': { ...REPO, root: '/work/gitlab', repo: null },
    } })
    expect((await t.registry.subscribe(sub('a', 'c1', '/work/detached'))).state).toEqual({ kind: 'none' })
    expect((await t.registry.subscribe(sub('b', 'c1', '/work/gitlab'))).state).toEqual({ kind: 'unavailable', reason: 'not-github' })
    expect(t.calls).toHaveLength(0)
  })

  it('reports none when the branch has no PR and keeps looking every 2 min', async () => {
    const t = setup({ prs: [] })
    await t.registry.subscribe(sub())
    await t.flush()
    expect(t.pushes.at(-1)?.state).toEqual({ kind: 'none' })
    expect(t.nextDelay()).toBe(POLL.quiet)
  })
})

describe('PrWatchRegistry fetching and pushing', () => {
  it('starts loading, then pushes the PR summary', async () => {
    const t = setup({ local: { localAhead: 1, localDirty: true } })
    const { state } = await t.registry.subscribe(sub())
    expect(state).toEqual({ kind: 'loading' })
    await t.flush()
    const pushed = t.pushes.at(-1)
    expect(pushed?.sessionId).toBe('s1')
    expect(pushed?.state.kind).toBe('pr')
    if (pushed?.state.kind === 'pr') {
      expect(pushed.state.summary).toMatchObject({ number: 7, checks: 'success', localAhead: 1, localDirty: true, via: 'gh' })
    }
    expect(t.calls[0]?.variables).toEqual({ owner: 'acme', name: 'app', branch: 'feat/x' })
    // Just changed: next poll in 30 s
    expect(t.nextDelay()).toBe(POLL.recentChange)
  })

  it('shares one watcher between subscriptions and greets newcomers with the current state', async () => {
    const t = setup()
    await t.registry.subscribe(sub('s1', 'c1'))
    await t.flush()
    const before = t.pushes.length
    await t.registry.subscribe(sub('s2', 'c2'))
    expect(t.calls).toHaveLength(1)
    expect(t.pushes.slice(before).map(p => `${p.clientId}/${p.sessionId}/${p.state.kind}`)).toEqual(['c2/s2/pr'])
  })

  it('does not re-push an unchanged state, but pushes changes', async () => {
    const t = setup()
    await t.registry.subscribe(sub())
    await t.flush()
    const count = t.pushes.length
    await t.advance(POLL.recentChange)
    expect(t.calls).toHaveLength(2)
    expect(t.pushes.length).toBe(count)
    t.setPrs([{ ...PR, commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] } }])
    await t.advance(POLL.recentChange)
    const last = t.pushes.at(-1)?.state
    expect(last?.kind === 'pr' && last.summary.checks).toBe('failure')
  })

  it('refetches at once on a nudge (agent turn end)', async () => {
    const t = setup()
    await t.registry.subscribe(sub())
    await t.flush()
    await t.registry.nudge('s1')
    expect(t.calls).toHaveLength(2)
  })

  it('keeps the last good state on errors and backs off', async () => {
    const t = setup()
    await t.registry.subscribe(sub())
    await t.flush()
    const count = t.pushes.length
    t.failNextWith(new GitHubRequestError('offline'))
    await t.registry.nudge('s1')
    expect(t.pushes.length).toBe(count)
    expect(t.nextDelay()).toBe(POLL.errorBase)
  })

  it('hides the chip when the very first fetch fails', async () => {
    const t = setup()
    t.failNextWith(new GitHubRequestError('offline'))
    await t.registry.subscribe(sub())
    await t.flush()
    expect(t.pushes.at(-1)?.state).toEqual({ kind: 'unavailable', reason: 'error' })
  })

  it('honours Retry-After', async () => {
    const t = setup()
    await t.registry.subscribe(sub())
    await t.flush()
    t.failNextWith(new GitHubRequestError('rate limit', 403, 5 * 60_000))
    await t.registry.nudge('s1')
    expect(t.nextDelay()).toBe(5 * 60_000)
  })
})

describe('PrWatchRegistry lifecycle', () => {
  it('stops polling and the ref watcher when the last subscriber leaves', async () => {
    const t = setup()
    const a = await t.registry.subscribe(sub('s1', 'c1'))
    const b = await t.registry.subscribe(sub('s1', 'c2'))
    await t.flush()
    t.registry.unsubscribe(a.subscriptionId)
    expect(t.timers.size).toBe(1)
    t.registry.unsubscribe(b.subscriptionId)
    expect(t.timers.size).toBe(0)
    expect(t.stoppedRefWatchers).toBe(1)
  })

  it('drops a disconnected client', async () => {
    const t = setup()
    await t.registry.subscribe(sub('s1', 'c1'))
    await t.flush()
    t.registry.dropClient('c1')
    expect(t.timers.size).toBe(0)
  })

  it('follows a branch switch seen by the ref watcher', async () => {
    const t = setup()
    await t.registry.subscribe(sub())
    await t.flush()
    t.repos['/work/app'] = { ...REPO, branch: 'feat/y', remoteBranch: 'feat/y' }
    t.setPrs([])
    t.refWatchers.get('/work/app')?.()
    await t.flush()
    await t.flush()
    expect(t.calls.at(-1)?.variables).toMatchObject({ branch: 'feat/y' })
    expect(t.pushes.at(-1)?.state).toEqual({ kind: 'none' })
    expect(t.stoppedRefWatchers).toBe(1)
  })
})

describe('PrWatchRegistry details', () => {
  it('fetches details once per 10 s and refreshes the local state', async () => {
    const t = setup()
    await t.registry.subscribe(sub())
    await t.flush()
    t.setLocal({ localAhead: 0, localDirty: true })
    const details = await t.registry.getDetails('s1', 'c1')
    expect(details).toMatchObject({ additions: 1, deletions: 2, changedFiles: 3, lastCommit: { sha: 'abc', author: 'A' } })
    const last = t.pushes.at(-1)?.state
    expect(last?.kind === 'pr' && last.summary.localDirty).toBe(true)
    await t.registry.getDetails('s1', 'c1')
    expect(t.calls.filter(c => c.query.includes('PrDetails'))).toHaveLength(1)
  })

  it('returns null without a PR', async () => {
    const t = setup({ prs: [] })
    await t.registry.subscribe(sub())
    await t.flush()
    expect(await t.registry.getDetails('s1', 'c1')).toBeNull()
  })
})
