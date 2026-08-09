/** Transport-agnostic context shared by session-scoped tool handlers. */

import type {
  AuthRequest,
  DeveloperFeedback,
  GoogleService,
  McpSourceConfig,
  MicrosoftService,
  SlackService,
  SourceConfig,
  ValidationResult,
} from './types.ts';

export interface LoadedSource {
  config: SourceConfig;
  folderPath: string;
  workspaceRootPath: string;
  workspaceId: string;
}

export interface SessionToolCallbacks {
  onPlanSubmitted(planPath: string): void;
  onAuthRequest(request: AuthRequest): void;
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
  validateSource(workspaceRootPath: string, sourceSlug: string): ValidationResult;
  validateAllSources(workspaceRootPath: string): ValidationResult;
  validatePreferences(): ValidationResult;
  validatePermissions(workspaceRootPath: string, sourceSlug?: string): ValidationResult;
  validateToolIcons(): ValidationResult;
  validateAll(workspaceRootPath: string): ValidationResult;
  validateSkill(workspaceRootPath: string, skillSlug: string): ValidationResult;
}

export interface CredentialManagerInterface {
  hasValidCredentials(source: LoadedSource): Promise<boolean>;
  getToken(source: LoadedSource): Promise<string | null>;
  refresh(source: LoadedSource): Promise<string | null>;
}

export interface StdioMcpConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export type HttpMcpConfig = Required<Pick<McpSourceConfig, 'url'>>
  & Pick<McpSourceConfig, 'authType' | 'headers' | 'headerNames' | 'transport'>
  & { accessToken?: string };

export interface StdioValidationResult {
  success: boolean;
  error?: string;
  toolCount?: number;
  toolNames?: string[];
  serverName?: string;
  serverVersion?: string;
}

export interface McpValidationResult extends StdioValidationResult {
  needsAuth?: boolean;
}

export interface ApiTestResult {
  success: boolean;
  status?: number;
  error?: string;
  hint?: string;
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
  sessionId: string;
  workspacePath: string;
  readonly sourcesPath: string;
  skillsPath: string;
  plansFolderPath: string;
  workingDirectory?: string;
  callbacks: SessionToolCallbacks;
  fs: FileSystemInterface;
  validators?: ValidatorInterface;
  credentialManager?: CredentialManagerInterface;
  loadSourceConfig(sourceSlug: string): SourceConfig | null;
  saveSourceConfig?(source: SourceConfig): void;
  inferGoogleService?(url?: string): GoogleService | undefined;
  inferSlackService?(url?: string): SlackService | undefined;
  inferMicrosoftService?(url?: string): MicrosoftService | undefined;
  isGoogleOAuthConfigured?(clientId?: string, clientSecret?: string): boolean;
  isIconUrl?(value: string): boolean;
  downloadSourceIcon?(sourceSlug: string, iconUrl: string): Promise<string | null>;
  deriveServiceUrl?(source: SourceConfig): string | null;
  getHighQualityLogoUrl?(serviceUrl: string, slug: string): Promise<string | null>;
  downloadIcon?(destPath: string, url: string, tag: string): Promise<string | null>;
  validateStdioMcpConnection?(config: StdioMcpConfig): Promise<StdioValidationResult>;
  validateMcpConnection?(config: HttpMcpConfig): Promise<McpValidationResult>;
  testApiSource?(source: SourceConfig): Promise<ApiTestResult>;
  testGoogleSource?(source: SourceConfig): Promise<ApiTestResult>;
  activateSourceInSession?(sourceSlug: string): Promise<{
    ok: boolean;
    reason?: string;
    availability?: 'next-turn';
  }>;
  submitFeedback?(feedback: DeveloperFeedback): void;
  updatePreferences?(updates: Record<string, unknown>): void;
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
