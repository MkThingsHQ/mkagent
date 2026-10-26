import { afterAll, describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runGit, runGitResult } from './git'

const root = mkdtempSync(join(tmpdir(), 'mkagent git spaces '))
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim()
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('asynchronous git', () => {
  it('returns unknown for empty paths, missing directories, errors and non-repositories', async () => {
    expect(await runGit('', ['rev-parse', '--show-toplevel'])).toBeNull()
    expect(await runGit(join(root, 'absent'), ['status'])).toBeNull()
    expect(await runGit(root, ['status'])).toBeNull()
    expect((await runGitResult('', ['status'])).ok).toBe(false)
    expect((await runGitResult(root, ['status'])).stderr).toContain('not a git repository')
  })
  it('looks up branches in paths with spaces and hides detached HEAD', async () => {
    git('init', '-b', 'main')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--allow-empty', '-m', 'fixture')
    expect(await runGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).toBe('main')
    git('checkout', '--detach')
    expect(await runGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).toBeNull()
  })
  it('lets the event loop run during git and bounds a stalled command', async () => {
    let ticked = false
    const pending = runGit(root, ['-c', 'alias.fixture-delay=!sleep 0.3', 'fixture-delay'], 40)
    await new Promise(resolve => setTimeout(() => { ticked = true; resolve(null) }, 5))
    expect(ticked).toBe(true)
    expect(await pending).toBeNull()
    expect((await runGitResult(root, ['-c', 'alias.fixture-delay=!sleep 0.3', 'fixture-delay'], 40)).ok).toBe(false)
  })
})
