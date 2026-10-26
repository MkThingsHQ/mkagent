/** Transport-agnostic context shared by session-scoped tool handlers. */

import type { DeveloperFeedback, ValidationResult } from './types.ts';

export interface SessionToolCallbacks {
  onPlanSubmitted(planPath: string): void;
}

export interface FileSystemInterface {
  exists(path: string): boolean;
  readFile(path: string): string;
  readFileBuffer(path: string): Buffer;
  writeFile(path: string, content: string): void;
  isDirectory(path: string): boolean;
  readdir(path: string): string[];
  stat(path: string): { size: number; isDirectory(): boolean };
}

export interface ValidatorInterface {
  validateConfig(): ValidationResult;
  validatePreferences(): ValidationResult;
  validatePermissions(workspaceRootPath: string): ValidationResult;
  validateToolIcons(): ValidationResult;
  validateAll(workspaceRootPath: string): ValidationResult;
  validateSkill(workspaceRootPath: string, skillSlug: string): ValidationResult;
}

export interface SessionInfo {
  id: string;
  name: string;
  permissionMode: string;
  createdAt: number;
  updatedAt?: number;
  workingDirectory?: string;
  llmConnection?: string;
  model?: string;
  isActive: boolean;
  isArchived?: boolean;
  isFlagged?: boolean;
  hasUnread?: boolean;
}

export interface SessionListItem {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt?: number;
  isArchived?: boolean;
  isFlagged?: boolean;
  hasUnread?: boolean;
  isProcessing?: boolean;
}

export interface ListSessionsOptions {
  search?: string;
  sortBy?: 'recent' | 'name';
  archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListSessionsResult {
  total: number;
  returned: number;
  sessions: SessionListItem[];
}

export interface SendAgentMessageResult {
  delivery: 'delivered' | 'queued';
  targetBusy: boolean;
}

export interface BackgroundTaskInfo {
  taskId: string;
  intent?: string;
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'orphaned';
  startTime: number;
  elapsedSeconds: number;
  completedAt?: number;
}

export interface SessionToolContext {
  prWatch?: PrWatchToolCallbacks;
  sessionId: string;
  workspacePath: string;
  skillsPath: string;
  plansFolderPath: string;
  workingDirectory?: string;
  callbacks: SessionToolCallbacks;
  fs: FileSystemInterface;
  validators?: ValidatorInterface;
  submitFeedback?(feedback: DeveloperFeedback): void;
  updatePreferences?(updates: Record<string, unknown>): void;
  archiveSession?(sessionId: string, archived: boolean): void | Promise<void>;
  getSessionInfo?(sessionId?: string): SessionInfo | null;
  listSessions?(options?: ListSessionsOptions): ListSessionsResult;
  listBackgroundTasks?(sessionId?: string): BackgroundTaskInfo[];
  sendAgentMessage?(
    sessionId: string,
    message: string,
    attachments?: Array<{ path: string; name?: string }>
  ): Promise<SendAgentMessageResult>;
  sessionPath?: string;
  dataPath?: string;
}

export function createNodeFileSystem(): FileSystemInterface {
  const fs = require('node:fs') as typeof import('node:fs');

  return {
    exists: path => fs.existsSync(path),
    readFile: path => fs.readFileSync(path, 'utf-8'),
    readFileBuffer: path => fs.readFileSync(path),
    writeFile: (path, content) => fs.writeFileSync(path, content, 'utf-8'),
    isDirectory: path => fs.existsSync(path) && fs.statSync(path).isDirectory(),
    readdir: path => fs.readdirSync(path),
    stat: path => {
      const stats = fs.statSync(path);
      return { size: stats.size, isDirectory: () => stats.isDirectory() };
    },
  };
}

export type PrToolMergeMethod = 'merge' | 'squash' | 'rebase';

/** One PR in a session's status (pr_status). */
export interface PrToolStatus {
  /** Stable id: host/owner/repo#number */
  id: string;
  origin: 'branch' | 'bound';
  number: number;
  title: string;
  url: string;
  /** open | draft | merged | closed */
  state: string;
  /** pending | success | failure | none */
  checks: string;
  /** approved | changes_requested | review_required | none */
  reviewDecision: string;
  /** clean | behind | blocked | conflicting | unstable | draft | unknown */
  mergeState: string;
  unresolvedThreads: number;
  localAhead: number;
  localDirty: boolean;
  autoMerge?: { enabled: boolean; method?: PrToolMergeMethod };
  /**
   * Set while auto-merge is off and GitHub won't turn it on: repo-disabled (the repository has it
   * off), draft, mergeable (nothing pending, so it can be merged now) or unavailable (e.g. no access)
   */
  autoMergeBlocked?: 'repo-disabled' | 'draft' | 'mergeable' | 'unavailable';
  /** Auto-fix (the card's Fix toggle) is on: new review feedback gets fixed automatically */
  autoFix?: boolean;
  /** Which credential answered ("gh" or a source name) */
  via: string;
}

export interface PrToolStatusResult {
  /** 'ready' with prs, else why the session has none */
  kind: 'ready' | 'none' | 'unavailable' | 'loading';
  /** Why there are no PRs (not-git / not-github / no-token / error), when kind !== 'ready' */
  reason?: string;
  /** The session the status is for (defaults to the current session) */
  sessionId: string;
  prs: PrToolStatus[];
  /** True when state came from persisted bindings without a live fetch (cross-session, R3). */
  cached?: boolean;
}

export interface PrBindToolResult {
  ok: boolean;
  error?: string;
  /** The bound PR's status when ok */
  pr?: PrToolStatus;
  /** Total PRs bound to the session after the change */
  boundCount?: number;
  /** Not pinned (with `skipBranchPr`): it is the folder's own branch PR */
  skipped?: 'branch-pr';
}

export interface PrUnbindToolResult {
  ok: boolean;
  error?: string;
  /** False when the ref wasn't actually bound */
  removed?: boolean;
  boundCount?: number;
}

export interface PrAutoMergeToolResult {
  ok: boolean;
  error?: string;
  enabled?: boolean;
  method?: PrToolMergeMethod;
}

/**
 * PR watcher callbacks, injected by the backend (SessionManager) bound to the invoking session.
 * Credential resolution and GitHub calls live behind these — the agent never sees a token.
 */
export interface PrWatchToolCallbacks {
  /** Status of the current session's PRs, or another session's persisted PRs (cross-session, no fetch). */
  status(input: { sessionId?: string }): Promise<PrToolStatusResult>;
  /**
   * Pin a PR to the current session by URL or number (verifies before persisting). `skipBranchPr`
   * (the post-tool hook after `gh pr create`) leaves out the folder's own branch PR, which the
   * carousel shows anyway.
   */
  bind(input: { ref: string; skipBranchPr?: boolean }): Promise<PrBindToolResult>;
  /** Remove a pinned PR from the current session. */
  unbind(input: { ref: string }): Promise<PrUnbindToolResult>;
  /** Enable/disable GitHub auto-merge on one of the current session's PRs. */
  setAutoMerge(input: { ref: string; enabled: boolean; method?: PrToolMergeMethod }): Promise<PrAutoMergeToolResult>;
}
