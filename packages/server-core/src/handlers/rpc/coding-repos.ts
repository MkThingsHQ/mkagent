/**
 * Coding mode's worktree picker RPCs: list the repositories a new session can start from (local +
 * `gh repo list`) and create the session's worktree. They run on the workspace server, where the
 * repositories and the `gh` login live.
 */

import { RPC_CHANNELS, type CreateWorktreeRequest, type CreateWorktreeResult, type RepoListing } from '@mkagent/shared/protocol'
import { getWorkspaceByNameOrId } from '@mkagent/shared/config'
import { loadWorkspaceConfig } from '@mkagent/shared/workspaces'
import type { RpcServer } from '@mkagent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { cloneRootFor, discoverLocalRepos } from '../../services/coding-repos/discover'
import { listGitHubRepos } from '../../services/coding-repos/github'
import { createWorktree } from '../../services/coding-repos/worktree'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.git.LIST_REPOS,
  RPC_CHANNELS.git.CREATE_WORKTREE,
] as const

/** Recent folders the client may send (it keeps the history); more would only slow the scan. */
const MAX_RECENT_DIRS = 20

function workspaceFolders(workspaceId: string): { root: string; folder?: string } {
  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace) throw new Error('Unknown workspace')
  const folder = loadWorkspaceConfig(workspace.rootPath)?.defaults?.workingDirectory
  return { root: workspace.rootPath, folder: folder || undefined }
}

async function listing(workspaceId: string, recentDirs: unknown, refreshGitHub: boolean): Promise<RepoListing> {
  const { root, folder } = workspaceFolders(workspaceId)
  const recent = Array.isArray(recentDirs) ? recentDirs.filter((d): d is string => typeof d === 'string').slice(0, MAX_RECENT_DIRS) : []
  const [local, github] = await Promise.all([
    discoverLocalRepos({ workspaceFolder: folder, recentDirs: recent }),
    listGitHubRepos({ fresh: refreshGitHub }),
  ])
  // A GitHub repo that is already on disk is listed once, as the local one
  const localNames = new Set(local.map(repo => repo.nameWithOwner?.toLowerCase()).filter(Boolean))
  return {
    local,
    github: github.repos.filter(repo => !localNames.has(repo.nameWithOwner.toLowerCase())),
    cloneRoot: cloneRootFor(local, folder, root),
    githubUnavailable: github.unavailable,
  }
}

export function registerCodingReposHandlers(server: RpcServer, _deps: HandlerDeps): void {
  server.handle(RPC_CHANNELS.git.LIST_REPOS, async (_ctx, workspaceId: string, recentDirs: string[], options?: { refreshGitHub?: boolean }): Promise<RepoListing> => {
    return listing(workspaceId, recentDirs, !!options?.refreshGitHub)
  })

  server.handle(RPC_CHANNELS.git.CREATE_WORKTREE, async (_ctx, workspaceId: string, request: CreateWorktreeRequest, recentDirs: string[]): Promise<CreateWorktreeResult> => {
    // The clone folder is derived here, as in the listing, never taken from the client
    const { cloneRoot } = await listing(workspaceId, recentDirs, false)
    return createWorktree(request, { cloneRoot })
  })
}
