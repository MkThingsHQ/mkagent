/**
 * Coding mode post-tool hook: a Bash `gh pr create` pins the PR it printed to the session's PR
 * carousel (BaseAgent.pinCreatedPr), from Pi tool results.
 */
import { afterEach, describe, expect, it } from 'bun:test'
import { createBackend } from '../backend/factory.ts'
import type { BackendConfig } from '../backend/types.ts'
import { mergeSessionScopedToolCallbacks, unregisterSessionScopedToolCallbacks } from '../session-scoped-tool-callback-registry.ts'

const SESSION = 'pin-created-pr-test'
const PR_URL = 'https://github.com/acme/app/pull/12'

function agent(profile: 'coding' | 'default' = 'coding', provider: 'pi' = 'pi') {
  const config: BackendConfig = {
    provider,
    workspace: { id: 'ws', name: 'WS', slug: 'ws', rootPath: '/test/workspace', createdAt: 0 },
    session: { id: SESSION, name: 'S', workspaceRootPath: '/test/workspace', createdAt: 0, lastUsedAt: 0, permissionMode: 'ask' } as never,
    isHeadless: true,
    agentProfile: profile,
  }
  return createBackend(config) as unknown as {
    pinCreatedPr(command: unknown, output: string): Promise<string | null>
  }
}

/** Fake PR watcher callbacks for the session; merged after the agent registered its own. */
function prWatch(result: { ok: boolean; skipped?: 'branch-pr' } = { ok: true }) {
  const binds: Array<{ ref: string; skipBranchPr?: boolean }> = []
  mergeSessionScopedToolCallbacks(SESSION, {
    prWatch: {
      bind: async (input) => { binds.push(input); return result },
      status: async () => ({ kind: 'none', sessionId: SESSION, prs: [] }),
      unbind: async () => ({ ok: true }),
      setAutoMerge: async () => ({ ok: true }),
    },
  })
  return binds
}

afterEach(() => unregisterSessionScopedToolCallbacks(SESSION))

describe('post-tool hook: pin the PR gh pr create opened', () => {
  it('Pi pins the created PR in Coding mode', async () => {
    const pi = agent()
    const binds = prWatch()
    const out = await pi.pinCreatedPr('git push -u origin feat/x && gh pr create --fill', `Creating pull request\n\n${PR_URL}\n`)
    expect(binds).toEqual([{ ref: PR_URL, skipBranchPr: true }])
    expect(out).toContain(PR_URL)
  })

  it("says nothing when it is the folder's own branch PR (not pinned)", async () => {
    const pi = agent()
    prWatch({ ok: true, skipped: 'branch-pr' })
    expect(await pi.pinCreatedPr('gh pr create --fill', PR_URL)).toBeNull()
  })

  it('does nothing outside Coding mode, for other commands and for other tools', async () => {
    const plain = agent('default')
    const coding = agent()
    const binds = prWatch()
    await plain.pinCreatedPr('gh pr create --fill', PR_URL)
    await coding.pinCreatedPr('gh pr view 12', PR_URL)
    expect(binds).toEqual([])
  })

  it('Pi shares the same step', async () => {
    const pi = agent('coding', 'pi')
    const binds = prWatch()
    expect(await pi.pinCreatedPr('gh pr create --fill', PR_URL)).toContain(PR_URL)
    expect(binds).toEqual([{ ref: PR_URL, skipBranchPr: true }])
  })
})
