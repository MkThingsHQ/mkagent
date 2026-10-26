import { expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pinnedCheckoutPreface } from '@mkagent/shared/pr-watch'
import type { PrSummary } from '@mkagent/shared/protocol'

it('the pinned action checkout strategy preserves a dirty branch across existing worktrees, new worktrees and fork clones', () => {
  const root = mkdtempSync(join(tmpdir(), 'pr-isolation-'))
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test' }
  const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: 'pipe', env }).trim()
  try {
    const own = join(root, 'own'); mkdirSync(own); git(own, 'init', '-b', 'main')
    writeFileSync(join(own, 'file'), 'base'); git(own, 'add', '.'); git(own, 'commit', '-m', 'base')
    git(own, 'switch', '-c', 'current'); writeFileSync(join(own, 'file'), 'uncommitted original')
    const fork = join(root, 'fork'); git(root, 'clone', own, fork); git(fork, 'switch', '-c', 'review')
    writeFileSync(join(fork, 'file'), 'fork review head'); git(fork, 'add', '.'); git(fork, 'commit', '-m', 'review')
    const forkHead = git(fork, 'rev-parse', 'HEAD')
    const existing = join(root, 'existing'); git(own, 'worktree', 'add', '-b', 'existing-pr', existing, 'main')
    const expectedStatus = git(own, 'status', '--porcelain')
    const summary = { number: 9, headRef: 'review', url: 'https://github.com/fixture/base/pull/9' } as PrSummary
    const prompt = pinnedCheckoutPreface(summary)
    expect(prompt).toContain("Don't switch this folder's branch or change its files")
    expect(prompt).toContain('git worktree list'); expect(prompt).toContain('git worktree add --detach'); expect(prompt).toContain('gh repo clone')
    // `gh pr checkout` is represented by a local fork fetch: no GitHub mutation or credential.
    for (const [kind, target] of [['existing', existing], ['new', join(root, 'new')], ['clone', join(root, 'clone')]]) {
      if (kind === 'new') git(own, 'worktree', 'add', '--detach', target!, 'main')
      if (kind === 'clone') git(root, 'clone', own, target!)
      git(target!, 'fetch', fork, 'review'); git(target!, 'switch', '--detach', 'FETCH_HEAD')
      expect(git(target!, 'rev-parse', 'HEAD')).toBe(forkHead)
      writeFileSync(join(target!, 'file'), `${kind} local fix`)
      expect(git(own, 'symbolic-ref', '--short', 'HEAD')).toBe('current')
      expect(git(own, 'status', '--porcelain')).toBe(expectedStatus)
      expect(readFileSync(join(own, 'file'), 'utf8')).toBe('uncommitted original')
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
