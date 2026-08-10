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
  AuthResult,
  CreateSessionOptions,
  CredentialResponse,
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
  updateWorkingDirectory(sessionId: string, path: string): void
  setSessionSources(sessionId: string, sourceSlugs: string[]): Promise<void>
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
  respondToCredential(sessionId: string, requestId: string, response: CredentialResponse): Promise<boolean>
  getSessionPermissionModeState(sessionId: string): PermissionModeState | null

  setPendingPlanExecution(
    sessionId: string,
    planPath: string,
    draftInputSnapshot?: string,
  ): Promise<void>
  markPendingPlanExecutionDispatched(sessionId: string): Promise<void>
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
  completeAuthRequest(sessionId: string, result: AuthResult): Promise<void>
}
