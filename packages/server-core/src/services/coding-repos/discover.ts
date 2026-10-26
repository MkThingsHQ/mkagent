/**
 * Which repositories a new Coding session can start a worktree from: the git repos directly inside
 * the workspace's default folder, plus the repos of recently used working folders. Every worktree
 * of a repository (a bare-repo layout can have dozens) collapses into one entry, keyed by its shared
 * git dir. Read-only: git is asked, nothing is changed.
 */

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { LocalRepo } from '@mkagent/shared/protocol'
import { runGit } from '../git'
import { parseRemoteUrl } from '../pr-watch/remote-url'

/** Folders looked at inside the workspace folder (the rest are skipped, newest-name order). */
const MAX_WORKSPACE_ENTRIES = 300
const CONCURRENCY = 8

export interface DiscoverInput {
  /** The workspace's default working directory (may be unset or missing) */
  workspaceFolder?: string
  /** Recently used working folders, most recent first */
  recentDirs?: readonly string[]
}

/** A shared git dir for `dir` (a work tree, a subfolder of one, or a bare repo), or null. */
export async function commonGitDir(dir: string): Promise<string | null> {
  const out = await runGit(dir, ['rev-parse', '--git-common-dir'])
  if (!out) return null
  const absolute = resolve(dir, out)
  try {
    return realpathSync(absolute)
  } catch {
    return absolute
  }
}

/** The folder git commands for a repository run in: the main work tree, or the bare repo itself. */
export function repoCommandDir(gitDir: string): string {
  return basename(gitDir) === '.git' ? dirname(gitDir) : gitDir
}

/**
 * Where new worktrees go: next to the main work tree of a plain clone (`~/code/app` →
 * `~/code/app-<branch>`), or next to the bare repo in a bare layout (`~/code/app/.bare` →
 * `~/code/app/<branch>`), matching how both layouts are usually organised.
 */
export function worktreeParentFor(gitDir: string): string {
  return basename(gitDir) === '.git' ? dirname(dirname(gitDir)) : dirname(gitDir)
}

/** Cheap pre-filter for folders inside the workspace folder, before asking git. */
function looksLikeRepo(path: string): boolean {
  if (existsSync(join(path, '.git'))) return true
  // Bare repos (`app.git`, `.bare`) have HEAD and objects/ at their top level
  return existsSync(join(path, 'HEAD')) && existsSync(join(path, 'objects'))
}

function workspaceCandidates(folder: string | undefined): string[] {
  if (!folder) return []
  try {
    if (!statSync(folder).isDirectory()) return []
  } catch {
    return []
  }
  const candidates = looksLikeRepo(folder) ? [folder] : []
  let entries: string[] = []
  try {
    entries = readdirSync(folder, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name !== 'node_modules')
      .map(entry => join(folder, entry.name))
      .slice(0, MAX_WORKSPACE_ENTRIES)
  } catch {
    return candidates
  }
  return [...candidates, ...entries.filter(looksLikeRepo)]
}

async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function describeRepo(gitDir: string, origin: LocalRepo['origin']): Promise<LocalRepo> {
  const dir = repoCommandDir(gitDir)
  const [originUrl, worktreeList] = await Promise.all([
    runGit(dir, ['config', '--get', 'remote.origin.url']),
    runGit(dir, ['worktree', 'list', '--porcelain']),
  ])
  const coords = originUrl ? parseRemoteUrl(originUrl) : null
  // `worktree list` includes a bare repo itself as an entry marked "bare"
  const blocks = (worktreeList ?? '').split('\n\n').filter(block => block.startsWith('worktree '))
  const worktrees = blocks.filter(block => !block.split('\n').includes('bare')).length
  const folderName = basename(gitDir) === '.git' || basename(gitDir) === '.bare' ? basename(dirname(gitDir)) : basename(gitDir).replace(/\.git$/, '')
  return {
    kind: 'local',
    name: coords?.repo ?? folderName,
    nameWithOwner: coords ? `${coords.owner}/${coords.repo}` : undefined,
    gitDir,
    worktreeParent: worktreeParentFor(gitDir),
    worktrees,
    origin,
  }
}

export async function discoverLocalRepos({ workspaceFolder, recentDirs = [] }: DiscoverInput): Promise<LocalRepo[]> {
  const recent = recentDirs.filter(dir => {
    try {
      return statSync(dir).isDirectory()
    } catch {
      return false
    }
  })
  const fromWorkspace = workspaceCandidates(workspaceFolder)

  const recentGitDirs = await mapLimited(recent, CONCURRENCY, commonGitDir)
  const workspaceGitDirs = await mapLimited(fromWorkspace, CONCURRENCY, commonGitDir)

  // Recent repos first (in recency order), then the workspace folder's, each repository once
  const ordered = new Map<string, LocalRepo['origin']>()
  for (const gitDir of recentGitDirs) if (gitDir && !ordered.has(gitDir)) ordered.set(gitDir, 'recent')
  const workspaceOnly = [...new Set(workspaceGitDirs.filter((d): d is string => !!d && !ordered.has(d)))].sort((a, b) => a.localeCompare(b))
  for (const gitDir of workspaceOnly) ordered.set(gitDir, 'workspace')

  return mapLimited([...ordered], CONCURRENCY, ([gitDir, origin]) => describeRepo(gitDir, origin))
}

/**
 * Where a GitHub repo is cloned: the folder most local repositories live in (for a bare layout,
 * the folder that holds the layout), else the workspace folder, else none (the picker then hides
 * GitHub-only repos rather than guess).
 */
export function cloneRootFor(repos: readonly LocalRepo[], workspaceFolder: string | undefined, workspaceRoot: string | undefined): string | null {
  const counts = new Map<string, number>()
  for (const repo of repos) {
    const home = basename(repo.gitDir) === '.git' ? repo.worktreeParent : dirname(repo.worktreeParent)
    counts.set(home, (counts.get(home) ?? 0) + 1)
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (best) return best
  // The workspace's own data folder is not a place for code
  if (workspaceFolder && workspaceFolder !== workspaceRoot && existsSync(workspaceFolder)) return workspaceFolder
  return null
}
