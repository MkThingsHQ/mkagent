import { expect, it } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

it('executes the Coding PR tools through real Pi RPC and persists pins/cursors across restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mkagent-pr-pi-'))
  const previous = process.env.CONFIG_DIR
  process.env.CONFIG_DIR = root
  const repo = join(root, 'repo'); mkdirSync(repo)
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim()
  git('init', '-b', 'feat/x'); writeFileSync(join(repo, 'file'), 'dirty work preserved')
  git('remote', 'add', 'origin', 'https://github.com/acme/app.git')
  const ws = { id: 'pr-ws', slug: 'pr-ws', name: 'PR fixture', rootPath: join(root, 'workspace'), createdAt: 1 }
  mkdirSync(ws.rootPath)
  writeFileSync(join(root, 'config.json'), JSON.stringify({ workspaces: [ws], activeWorkspaceId: ws.id, activeSessionId: null }))
  const { ensureConfigDir } = await import('@mkagent/shared/config'); ensureConfigDir()
  const { SessionManager } = await import('../sessions/SessionManager')
  const { loadSession } = await import('@mkagent/shared/sessions')
  const { PiAgent } = await import('@mkagent/shared/agent')
  const { mergeSessionScopedToolCallbacks } = await import('@mkagent/shared/agent')
  const { PrWatchRegistry } = await import('../services/pr-watch/registry')
  const { buildPrWatchToolCallbacks } = await import('./tool-callbacks')
  let sm = new SessionManager(); await sm.initialize()
  const session = await sm.createSession(ws.id, { workingDirectory: repo, codingMode: true, permissionMode: 'safe' })
  let queries = 0; let mutations = 0
  const pr = (n: number) => ({ id: `PR_${n}`, number: n, title: `Fixture ${n}`, url: `https://github.com/acme/app/pull/${n}`, state: 'OPEN', isDraft: false, headRefName: n === 7 ? 'feat/x' : 'other', baseRefName: 'main', headRefOid: 'abc', headRepositoryOwner: { login: 'acme' }, reviewDecision: null, mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED', autoMergeRequest: null, viewerCanEnableAutoMerge: true, baseRepository: { autoMergeAllowed: true, viewerDefaultMergeMethod: 'SQUASH', squashMergeAllowed: true, mergeCommitAllowed: false, rebaseMergeAllowed: false }, commits: { nodes: [] }, reviewThreads: { nodes: [] } })
  const registry = new PrWatchRegistry({
    candidates: async () => [{ id: 'fixture', label: 'fixture', getToken: async () => 'fixture' }],
    graphql: async <T,>(_host: string, _token: string, query: string, variables: Record<string, unknown>): Promise<T> => {
      queries++
      if (query.includes('mutation')) { mutations++; return { enablePullRequestAutoMerge: { pullRequest: { id: 'PR_7', autoMergeRequest: { mergeMethod: variables.method } } } } as T }
      return { rateLimit: null, repository: { pullRequests: { nodes: [pr(7)] }, pullRequest: pr(Number(variables.number ?? 7)) } } as T
    }, push: () => {}, watchRefs: () => () => {},
  })
  const subscribed = await registry.subscribe({ clientId: 'fixture', sessionId: session.id, dir: repo, workspaceRootPath: ws.rootPath })
  await registry.nudge(session.id)
  const baselineQueries = queries
  const bodies: any[] = []
  let action = 'pr_status'
  const endpoint = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const body = await request.json() as any; bodies.push(body)
    const last = body.messages.at(-1)
    const finished = last.role === 'tool' || (action === 'read-image' && JSON.stringify(last.content).includes('data:image/'))
    const args = action === 'read-image' ? { path: join(repo, 'large.png') } : action === 'bash-create' ? { command: "gh() { printf '%s\\n' 'https://github.com/acme/app/pull/16'; }; gh pr create --fill" } : action === 'pr_status' ? {} : action === 'pr_set_auto_merge' ? { pr: 'https://github.com/acme/app/pull/7', enabled: true } : { pr: 'https://github.com/acme/app/pull/9' }
    const delta = finished ? { content: 'Fixture tool complete.' } : { tool_calls: [{ index: 0, id: `call-${bodies.length}`, type: 'function', function: { name: action === 'read-image' ? 'read' : action === 'bash-create' ? 'bash' : `mcp__session__${action}`, arguments: JSON.stringify(args) } }] }
    return new Response(`data: ${JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: finished ? 'stop' : 'tool_calls' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
  } })
  const agent = new PiAgent({ provider: 'pi', providerType: 'pi_compat', authType: 'none', model: 'fixture', workspace: ws, session: { id: session.id, workspaceRootPath: ws.rootPath, createdAt: 1, lastUsedAt: 1, permissionMode: 'safe', workingDirectory: repo }, agentProfile: 'coding', isHeadless: true, skipConfigWatcher: true, runtime: { paths: { node: process.execPath, piServer: resolve(import.meta.dir, '../../../pi-agent-server/src/index.ts') }, baseUrl: `http://127.0.0.1:${endpoint.port}/v1`, customEndpoint: { api: 'openai-completions' }, customModels: [{ id: 'fixture', contextWindow: 131072, supportsImages: true }] } })
  const call = async (name: string) => { action = name; const events = []; for await (const event of agent.chat(`Fixture ${name}`)) events.push(event); return events }
  try {
    mergeSessionScopedToolCallbacks(session.id, { prWatch: buildPrWatchToolCallbacks({ sessionId: session.id, sessionManager: sm, getRegistry: () => registry }) })
    await call('pr_status')
    expect(queries).toBe(baselineQueries) // header snapshot reused even through real subprocess RPC
    expect(JSON.stringify(bodies.at(-1))).toContain('Fixture 7')
    const blocked = await call('pr_set_auto_merge'); expect(blocked.some(e => e.type === 'tool_result' && e.isError)).toBe(true); expect(mutations).toBe(0)
    agent.setPermissionMode('allow-all'); sm.setSessionPermissionMode(session.id, 'allow-all')
    await call('pr_bind'); expect(sm.getSessionBoundPrs(session.id).map(p => p.number)).toEqual([9])
    await call('pr_set_auto_merge'); expect(mutations).toBe(1)
    await call('bash-create')
    for (let i = 0; i < 50 && sm.getSessionBoundPrs(session.id).length < 2; i++) await new Promise(r => setTimeout(r, 10))
    expect(sm.getSessionBoundPrs(session.id).map(p => p.number)).toEqual([9, 16])
    sm.setSessionPrAutoFix(session.id, 'github.com/acme/app#7', true)
    sm.recordPrAutoFixRun(session.id, 'github.com/acme/app#7', ['t:trusted:1'], 100)
    await sm.flushAllSessions(); sm.cleanup(); sm = new SessionManager(); await sm.initialize()
    expect(sm.getSessionBoundPrs(session.id).map(p => p.number)).toEqual([9, 16])
    expect(sm.getSessionPrMonitors(session.id)['github.com/acme/app#7']).toMatchObject({ autoFix: true, lastFixSignature: ['t:trusted:1'] })
    expect(loadSession(ws.rootPath, session.id)?.boundPrs).toHaveLength(2)
    expect(git('symbolic-ref', '--short', 'HEAD')).toBe('feat/x'); expect(readFileSync(join(repo, 'file'), 'utf8')).toBe('dirty work preserved')
    mergeSessionScopedToolCallbacks(session.id, { prWatch: buildPrWatchToolCallbacks({ sessionId: session.id, sessionManager: sm, getRegistry: () => registry }) })
    await call('pr_unbind'); expect(sm.getSessionBoundPrs(session.id).map(p => p.number)).toEqual([16])
    const sharp = (await import('sharp')).default
    const oversized = await sharp(randomBytes(1400 * 1400 * 3), { raw: { width: 1400, height: 1400, channels: 3 } }).png().toBuffer()
    expect(oversized.length).toBeGreaterThan(3.75 * 1024 * 1024)
    writeFileSync(join(repo, 'large.png'), oversized)
    const imageEvents = await call('read-image')
    expect(imageEvents.some(e => e.type === 'tool_result' && e.isError)).toBe(false)
    const modelPayload = JSON.stringify(bodies.at(-1).messages)
    expect(modelPayload).toContain('data:image/')
    expect(modelPayload.length).toBeLessThan(oversized.length)
    expect(subscribed.subscriptionId).toBeTruthy()
  } finally { agent.destroy(); registry.dispose(); await sm.flushAllSessions(); sm.cleanup(); endpoint.stop(); if (previous === undefined) delete process.env.CONFIG_DIR; else process.env.CONFIG_DIR = previous; rmSync(root, { recursive: true, force: true }) }
}, 60_000)
