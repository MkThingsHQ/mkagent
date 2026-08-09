import type {
  AnnotationV1,
  ContentBadge,
  Message,
  PermissionRequest as BasePermissionRequest,
  StoredAttachment,
  ToolDisplayMeta,
  TypedError,
} from '@mkagent/core/types';
import type { PermissionMode } from '../agent/mode-types.ts';
import type { ThinkingLevel } from '../agent/thinking-levels.ts';
import type { CustomEndpointConfig } from '../config/llm-connections.ts';
import type {
  AuthRequest as SharedAuthRequest,
  CredentialAuthRequest as SharedCredentialAuthRequest,
  CredentialInputMode as SharedCredentialInputMode,
} from '@mkagent/session-tools-core';

export { generateMessageId } from '@mkagent/core/types';

export interface Session {
  id: string;
  workspaceId: string;
  workspaceName: string;
  name?: string;
  preview?: string;
  lastMessageAt: number;
  messages: Message[];
  isProcessing: boolean;
  isFlagged?: boolean;
  permissionMode?: PermissionMode;
  lastReadMessageId?: string;
  hasUnread?: boolean;
  enabledSourceSlugs?: string[];
  workingDirectory?: string;
  sessionFolderPath?: string;
  model?: string;
  llmConnection?: string;
  thinkingLevel?: ThinkingLevel;
  lastMessageRole?: 'user' | 'assistant' | 'plan' | 'tool' | 'error';
  lastFinalMessageId?: string;
  isAsyncOperationOngoing?: boolean;
  isRegeneratingTitle?: boolean;
  currentStatus?: { message: string; statusType?: string };
  createdAt?: number;
  messageCount?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    contextTokens: number;
    costUsd: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    contextWindow?: number;
  };
  hidden?: boolean;
  isArchived?: boolean;
  archivedAt?: number;
  supportsBranching?: boolean;
  parentSessionId?: string;
}

export interface CreateSessionOptions {
  name?: string;
  permissionMode?: PermissionMode;
  thinkingLevel?: ThinkingLevel;
  workingDirectory?: string | 'user_default' | 'none';
  model?: string;
  llmConnection?: string;
  enabledSourceSlugs?: string[];
  systemPromptPreset?: 'default' | 'mini' | string;
  hidden?: boolean;
  isFlagged?: boolean;
  branchFromMessageId?: string;
  branchFromSessionId?: string;
  parentSessionId?: string;
}

export interface PermissionModeState {
  permissionMode: PermissionMode;
  previousPermissionMode?: PermissionMode;
  transitionDisplay?: string;
  modeVersion: number;
  changedAt: string;
  changedBy: 'user' | 'system' | 'restore' | 'unknown';
}

export type SessionEvent =
  | { type: 'text_delta'; sessionId: string; delta: string; turnId?: string }
  | { type: 'text_complete'; sessionId: string; text: string; isIntermediate?: boolean; turnId?: string; parentToolUseId?: string; timestamp?: number; messageId?: string }
  | { type: 'tool_start'; sessionId: string; toolName: string; toolUseId: string; toolInput: Record<string, unknown>; toolIntent?: string; toolDisplayName?: string; toolDisplayMeta?: ToolDisplayMeta; turnId?: string; parentToolUseId?: string; timestamp?: number }
  | { type: 'tool_result'; sessionId: string; toolUseId: string; toolName: string; result: string; turnId?: string; parentToolUseId?: string; isError?: boolean; timestamp?: number }
  | { type: 'error'; sessionId: string; error: string; timestamp?: number }
  | { type: 'typed_error'; sessionId: string; error: TypedError; timestamp?: number }
  | { type: 'complete'; sessionId: string; tokenUsage?: Session['tokenUsage']; hasUnread?: boolean; backgroundTasksAlive?: boolean }
  | { type: 'interrupted'; sessionId: string; message?: Message; queuedMessages?: string[] }
  | { type: 'status'; sessionId: string; message: string; statusType?: 'compacting' }
  | { type: 'info'; sessionId: string; message: string; statusType?: 'compaction_complete'; level?: 'info' | 'warning' | 'error' | 'success'; timestamp?: number }
  | { type: 'title_generated'; sessionId: string; title: string }
  | { type: 'title_regenerating'; sessionId: string; isRegenerating: boolean }
  | { type: 'async_operation'; sessionId: string; isOngoing: boolean }
  | { type: 'working_directory_changed'; sessionId: string; workingDirectory: string }
  | { type: 'permission_request'; sessionId: string; request: PermissionRequest }
  | { type: 'credential_request'; sessionId: string; request: CredentialRequest }
  | { type: 'permission_mode_changed'; sessionId: string; permissionMode: PermissionMode; previousPermissionMode?: PermissionMode; transitionDisplay?: string; modeVersion?: number; changedAt?: string; changedBy?: PermissionModeState['changedBy'] }
  | { type: 'plan_submitted'; sessionId: string; message: Message }
  | { type: 'sources_changed'; sessionId: string; enabledSourceSlugs: string[] }
  | { type: 'connection_changed'; sessionId: string; connectionSlug: string; supportsBranching?: boolean }
  | { type: 'task_backgrounded'; sessionId: string; toolUseId: string; taskId: string; intent?: string; turnId?: string; kind?: 'workflow'; workflowId?: string }
  | { type: 'workflow_agent_completed'; sessionId: string; workflowId: string; agentId: string; turnId?: string }
  | { type: 'shell_backgrounded'; sessionId: string; toolUseId: string; shellId: string; intent?: string; command?: string; turnId?: string }
  | { type: 'task_progress'; sessionId: string; toolUseId: string; elapsedSeconds: number; turnId?: string }
  | { type: 'task_completed'; sessionId: string; taskId: string; status: 'completed' | 'failed' | 'stopped'; outputFile?: string; summary?: string; turnId?: string }
  | { type: 'shell_killed'; sessionId: string; shellId: string }
  | { type: 'user_message'; sessionId: string; message: Message; status: 'accepted' | 'queued' | 'processing'; optimisticMessageId?: string }
  | { type: 'session_flagged'; sessionId: string }
  | { type: 'session_unflagged'; sessionId: string }
  | { type: 'session_archived'; sessionId: string }
  | { type: 'session_unarchived'; sessionId: string }
  | { type: 'name_changed'; sessionId: string; name?: string }
  | { type: 'session_model_changed'; sessionId: string; model: string | null }
  | { type: 'session_deleted'; sessionId: string }
  | { type: 'session_created'; sessionId: string }
  | { type: 'auth_request'; sessionId: string; message: Message; request: SharedAuthRequest }
  | { type: 'auth_completed'; sessionId: string; requestId: string; success: boolean; cancelled?: boolean; error?: string }
  | { type: 'source_activated'; sessionId: string; sourceSlug: string; originalMessage: string }
  | { type: 'usage_update'; sessionId: string; tokenUsage: { inputTokens: number; contextWindow?: number } }
  | { type: 'message_annotations_updated'; sessionId: string; messageId: string; annotations: AnnotationV1[] }
  | { type: 'working_directory_error'; sessionId: string; error: string };

export interface SendMessageOptions {
  skillSlugs?: string[];
  badges?: ContentBadge[];
  optimisticMessageId?: string;
  hidden?: boolean;
}

export type SessionCommand =
  | { type: 'flag' }
  | { type: 'unflag' }
  | { type: 'archive' }
  | { type: 'unarchive' }
  | { type: 'rename'; name: string }
  | { type: 'markRead' }
  | { type: 'markUnread' }
  | { type: 'setActiveViewing'; workspaceId: string }
  | { type: 'setPermissionMode'; mode: PermissionMode }
  | { type: 'setThinkingLevel'; level: ThinkingLevel }
  | { type: 'updateWorkingDirectory'; dir: string }
  | { type: 'setSources'; sourceSlugs: string[] }
  | { type: 'showInFinder' }
  | { type: 'copyPath' }
  | { type: 'refreshTitle' }
  | { type: 'setConnection'; connectionSlug: string }
  | { type: 'setPendingPlanExecution'; planPath: string; draftInputSnapshot?: string }
  | { type: 'markCompactionComplete' }
  | { type: 'markPendingPlanExecutionDispatched' }
  | { type: 'clearPendingPlanExecution' }
  | { type: 'addAnnotation'; messageId: string; annotation: AnnotationV1 }
  | { type: 'removeAnnotation'; messageId: string; annotationId: string }
  | { type: 'updateAnnotation'; messageId: string; annotationId: string; patch: Partial<AnnotationV1> };

export interface NewChatActionParams { input?: string; name?: string }
export type { BasePermissionRequest };
export interface PermissionRequest extends BasePermissionRequest { sessionId: string }
export interface PermissionResponseOptions { rememberForMinutes?: number }

export type { SharedCredentialInputMode as CredentialInputMode };
export type CredentialRequest = SharedCredentialAuthRequest;
export type { SharedAuthRequest as AuthRequest };
export interface AuthResult {
  requestId: string;
  sourceSlug: string;
  success: boolean;
  cancelled?: boolean;
  error?: string;
  email?: string;
  workspace?: string;
}
export interface CredentialResponse {
  type: 'credential';
  value?: string;
  username?: string;
  password?: string;
  headers?: Record<string, string>;
  cancelled: boolean;
}

export interface OAuthResult {
  success: boolean;
  error?: string;
}

export interface McpValidationResult {
  success: boolean;
  error?: string;
  tools?: string[];
}

export interface McpToolWithPermission {
  name: string;
  description?: string;
  allowed: boolean;
}

export interface McpToolsResult {
  success: boolean;
  error?: string;
  tools?: McpToolWithPermission[];
}

export interface DirectoryListingResult {
  currentPath: string;
  parentPath: string | null;
  breadcrumbs: Array<{ name: string; path: string }>;
  platform: 'win32' | 'darwin' | 'linux';
  truncated: boolean;
  totalEntries: number;
  entries: Array<{ name: string; path: string; isSymlink: boolean }>;
}

export interface FileAttachment {
  type: 'image' | 'text' | 'pdf' | 'office' | 'audio' | 'unknown';
  path: string;
  name: string;
  mimeType: string;
  base64?: string;
  text?: string;
  size: number;
  thumbnailBase64?: string;
}
export interface SessionFile { name: string; path: string; type: 'file' | 'directory'; size?: number; children?: SessionFile[] }
export interface FileSearchResult { name: string; path: string; type: 'file' | 'directory'; relativePath: string }

export interface ClaudeOAuthIdentityDto {
  account?: { uuid?: string; emailAddress?: string };
  organization?: { uuid?: string; name?: string };
}

export interface LlmConnectionSetup {
  slug: string;
  credential?: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
  models?: string[] | null;
  piAuthProvider?: string;
  modelSelectionMode?: 'automaticallySyncedFromProvider' | 'userDefined3Tier';
  updateOnly?: boolean;
  customEndpoint?: CustomEndpointConfig;
  oauthIdentity?: ClaudeOAuthIdentityDto;
}
export interface TestLlmConnectionParams {
  provider: 'pi';
  apiKey: string;
  baseUrl?: string;
  model?: string;
  piAuthProvider?: string;
  customEndpoint?: CustomEndpointConfig;
}
export interface TestLlmConnectionResult { success: boolean; error?: string }
export interface ClaudeOAuthResult {
  success: boolean;
  token?: string;
  error?: string;
  identity?: ClaudeOAuthIdentityDto;
}
export interface SkillFile { name: string; type: 'file' | 'directory'; size?: number; children?: SkillFile[] }
export interface SessionSearchMatch { sessionId: string; lineNumber: number; snippet: string }
export interface SessionSearchResult { sessionId: string; matchCount: number; matches: SessionSearchMatch[] }
export interface UnreadSummary { totalUnreadSessions: number; byWorkspace: Record<string, number>; hasUnreadByWorkspace: Record<string, boolean> }
export interface RefreshTitleResult { success: boolean; title?: string; error?: string }

export interface PlanStep { id: string; description: string; tools?: string[]; status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped' }
export interface Plan { id: string; title: string; summary?: string; steps: PlanStep[]; questions?: string[]; state?: 'creating' | 'refining' | 'ready' | 'executing' | 'completed' | 'cancelled'; createdAt?: number; updatedAt?: number }
export interface GitBashStatus { found: boolean; path: string | null; platform: 'win32' | 'darwin' | 'linux' }
export interface UpdateInfo { available: boolean; currentVersion: string; latestVersion: string | null; downloadState: 'idle' | 'downloading' | 'ready' | 'installing' | 'error'; downloadProgress: number; error?: string }
export interface WorkspaceSettings { name?: string; model?: string; permissionMode?: PermissionMode; cyclablePermissionModes?: PermissionMode[]; thinkingLevel?: ThinkingLevel; workingDirectory?: string; localMcpEnabled?: boolean; defaultLlmConnection?: string; enabledSourceSlugs?: string[] }
export type WindowCloseRequestSource = 'keyboard-shortcut' | 'window-button' | 'unknown';
export interface WindowCloseRequest { source: WindowCloseRequestSource }
export interface BrowserInstanceInfo {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  boundSessionId: string | null;
  ownerType: 'session' | 'manual';
  ownerSessionId: string | null;
  isVisible: boolean;
  agentControlActive: boolean;
  themeColor: string | null;
  workspaceId?: string | null;
}
export interface DeepLinkNavigation {
  view?: string
  workspaceId?: string
  sessionId?: string
  settingsSection?: string
  action?: string
  actionParams?: Record<string, string>
}

export type StoredSessionAttachment = StoredAttachment;
