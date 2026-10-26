import type { BackgroundTaskOutput, StopBackgroundTaskResult } from '@mkagent/shared/protocol'
import type {
  ActiveSessionInfo,
  AnnotationV1,
  StoredAttachment,
  Workspace,
  WorkspaceInfo,
} from '@mkagent/core/types'
import type { PermissionMode } from '@mkagent/shared/agent/mode-types'
import type { ThinkingLevel } from '@mkagent/shared/agent/thinking-levels'
import type {
  BoundPr,
  PrMonitorState,
  CreateSessionOptions,
  FileAttachment,
  PermissionModeState,
  PermissionResponseOptions,
  SendMessageOptions,
  Session,
  UnreadSummary,
} from '@mkagent/shared/protocol'
import type { DispatchMode, SessionBundle } from '@mkagent/shared/sessions'
import type { EventSink } from '../transport'

/** Host-neutral contract used by Desktop, WebUI, CLI and headless server handlers. */
export interface ISessionManager {
  waitForInit(): Promise<void>
  initialize(): Promise<void>
  cleanup(): void
  setEventSink(sink: EventSink): void
  flushAllSessions(): Promise<void>

  getSessions(workspaceId?: string): Session[]
  getSession(sessionId: string): Promise<Session | null>
  createSession(
    workspaceId: string,
    options?: CreateSessionOptions,
    internal?: { emitCreatedEvent?: boolean },
  ): Promise<Session>
  getSessionWorkingDirectory(sessionId: string): string | undefined
  /** Calls `listener(sessionId)` each time a session's turn completes; returns an unsubscribe.
   *  (The PR watcher refetches then: a turn is when pushes and `gh pr create` happen.) */
  onPrWatchSessionChange?(listener: (sessionId: string | null) => void): () => void
  onTurnComplete?(listener: (sessionId: string) => void): () => void
  deleteSession(sessionId: string): Promise<void>

  flagSession(sessionId: string): Promise<void>
  unflagSession(sessionId: string): Promise<void>
  archiveSession(sessionId: string): Promise<void>
  unarchiveSession(sessionId: string): Promise<void>
  renameSession(sessionId: string, name: string): Promise<void>
  markSessionRead(sessionId: string): Promise<void>
  markSessionUnread(sessionId: string): Promise<void>
  markAllSessionsRead(workspaceId: string): Promise<void>
  setActiveViewingSession(sessionId: string | null, workspaceId: string): void
  clearActiveViewingSession(workspaceId: string): void

  setSessionPermissionMode(sessionId: string, mode: PermissionMode): void
  setSessionThinkingLevel(sessionId: string, level: ThinkingLevel): void
  setSessionCodingMode(sessionId: string, enabled: boolean): void
  continueSessionInNewSession(sessionId: string, codingMode: boolean): Promise<{ sessionId: string }>
  /** Coding mode: PRs pinned to a session (chat-header PR carousel, in addedAt order). */
  getSessionBoundPrs(sessionId: string): BoundPr[]
  /** Pin a PR to a session (deduped by host/owner/repo#number); persists and returns the new list. */
  bindPrToSession(sessionId: string, pr: BoundPr): BoundPr[]
  /** Remove a pinned PR from a session (and its auto-fix state); persists and returns the new list. */
  unbindPrFromSession(sessionId: string, pr: { host: string; owner: string; repo: string; number: number }): BoundPr[]
  /** Coding mode: per-PR monitor state (auto-fix), keyed by PR id. */
  getSessionPrMonitors(sessionId: string): Record<string, PrMonitorState>
  /** Turn auto-fix on/off for one PR of a session; persists and returns the monitors. */
  setSessionPrAutoFix(sessionId: string, prId: string, enabled: boolean): Record<string, PrMonitorState>
  /** Record an auto-fix run (time + the review signature it acted on). */
  recordPrAutoFixRun(sessionId: string, prId: string, signature: string[], at: number): void
  /** A session's metadata without loading its messages (cheap, unlike getSession). */
  getSessionSnapshot(sessionId: string): Session | null
  /** Start a hidden, app-labelled turn in an idle session; false (nothing sent) when missing or busy. */
  wakeIdleSessionWithNotice(sessionId: string, text: string): boolean
  updateWorkingDirectory(sessionId: string, path: string): void
  setSessionConnection(sessionId: string, connectionSlug: string): Promise<void>
  updateSessionModel(
    sessionId: string,
    workspaceId: string,
    model: string | null,
    connection?: string,
  ): Promise<void>

  sendMessage(
    sessionId: string,
    message: string,
    attachments?: FileAttachment[],
    storedAttachments?: StoredAttachment[],
    options?: SendMessageOptions,
    existingMessageId?: string,
    _isRetry?: boolean,
    onAck?: (messageId: string) => void,
    rpcContext?: { callerClientId?: string },
  ): Promise<void>
  cancelProcessing(sessionId: string, silent?: boolean): Promise<void>
  killShell(sessionId: string, shellId: string): Promise<{ success: boolean; error?: string }>
  getBackgroundTaskOutput(sessionId: string, taskId: string, kind?: 'agent' | 'shell' | 'workflow'): Promise<BackgroundTaskOutput | null>
  stopBackgroundTask(sessionId: string, taskId: string): Promise<StopBackgroundTaskResult>
  getSessionFinalText(sessionId: string): string | undefined
  onSessionComplete(
    listener: (event: import('../sessions/SessionManager').SessionCompletionEvent) => void,
  ): () => void

  addMessageAnnotation(sessionId: string, messageId: string, annotation: AnnotationV1): void
  removeMessageAnnotation(sessionId: string, messageId: string, annotationId: string): void
  updateMessageAnnotation(
    sessionId: string,
    messageId: string,
    annotationId: string,
    patch: Partial<AnnotationV1>,
  ): void

  respondToPermission(
    sessionId: string,
    requestId: string,
    allowed: boolean,
    alwaysAllow: boolean,
    options?: PermissionResponseOptions,
  ): boolean
  getSessionPermissionModeState(sessionId: string): PermissionModeState | null

  setPendingPlanExecution(
    sessionId: string,
    planPath: string,
    draftInputSnapshot?: string,
  ): Promise<void>
  markPendingPlanExecutionDispatched(sessionId: string): Promise<boolean>
  clearPendingPlanExecution(sessionId: string): Promise<void>
  getPendingPlanExecution(sessionId: string): {
    planPath: string
    draftInputSnapshot?: string
    awaitingCompaction: boolean
    executionDispatched: boolean
  } | null
  markCompactionComplete(sessionId: string): Promise<void>
  acceptPlan(sessionId: string, planPath?: string): Promise<void>

  exportSession(sessionId: string, workspaceId: string): Promise<SessionBundle | null>
  importSession(
    workspaceId: string,
    bundle: SessionBundle,
    mode: DispatchMode,
  ): Promise<{ sessionId: string; warnings?: string[] }>

  getSessionPath(sessionId: string): string | null
  refreshTitle(sessionId: string): Promise<{ success: boolean; title?: string; error?: string }>
  refreshBadge(): void
  getUnreadSummary(): UnreadSummary

  getWorkspaces(): Workspace[]
  getWorkspacesInfo(): WorkspaceInfo[]
  setupConfigWatcher(workspaceRootPath: string, workspaceId: string): void
  notifyConfigFileChange(workspaceRootPath: string, relativePath: string): void
  getActiveSessionCount(workspaceId?: string): number
  getActiveSessionsInfo(): ActiveSessionInfo[]

  reinitializeAuth(connectionSlug?: string): Promise<void>
  refreshConnectionRuntime(connectionSlug: string): Promise<void>
}
