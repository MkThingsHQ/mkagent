export * from '@mkagent/shared/protocol'

import type { StoredAttachment, Workspace } from '@mkagent/core/types'
import type { LlmConnection, LlmConnectionWithStatus, NetworkProxySettings } from '@mkagent/shared/config'
import type { LoadedSkill } from '@mkagent/shared/skills'
import type {
  BrowserInstanceInfo,
  CreateSessionOptions,
  FileAttachment,
  LlmConnectionSetup,
  PermissionResponseOptions,
  Session,
  SessionCommand,
  SessionEvent,
  SkillFile,
  TestLlmConnectionParams,
  TestLlmConnectionResult,
  UpdateInfo,
  WorkspaceSettings,
} from '@mkagent/shared/protocol'

export type TransportMode = 'local' | 'remote'
export type TransportConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected'

export interface TransportConnectionState {
  mode: TransportMode
  status: TransportConnectionStatus
  url: string
  attempt: number
  nextRetryInMs?: number
  lastError?: { message: string; code?: string }
  updatedAt: number
}

export interface ElectronAPI {
  getSessions(): Promise<Session[]>
  getSessionMessages(sessionId: string): Promise<Session | null>
  createSession(workspaceId: string, options?: CreateSessionOptions): Promise<Session>
  deleteSession(sessionId: string): Promise<void>
  sendMessage(sessionId: string, message: string, attachments?: FileAttachment[], storedAttachments?: StoredAttachment[]): Promise<void>
  cancelProcessing(sessionId: string, silent?: boolean): Promise<void>
  sessionCommand(sessionId: string, command: SessionCommand): Promise<unknown>
  respondToPermission(sessionId: string, requestId: string, allowed: boolean, alwaysAllow: boolean, options?: PermissionResponseOptions): Promise<boolean>
  onSessionEvent(callback: (event: SessionEvent) => void): () => void

  getWorkspaces(): Promise<Workspace[]>
  createWorkspace(folderPath: string, name: string): Promise<Workspace>
  getWindowWorkspace(): Promise<string | null>
  switchWorkspace(workspaceId: string): Promise<void>
  openWorkspace(workspaceId: string): Promise<void>
  openSessionInNewWindow(workspaceId: string, sessionId: string): Promise<void>

  getSkills(workspaceId: string, workingDirectory?: string): Promise<LoadedSkill[]>
  getSkillFiles(workspaceId: string, skillSlug: string): Promise<SkillFile[]>
  deleteSkill(workspaceId: string, skillSlug: string): Promise<void>
  openSkillInEditor(workspaceId: string, skillSlug: string): Promise<void>
  openSkillInFinder(workspaceId: string, skillSlug: string): Promise<void>
  onSkillsChanged(callback: (workspaceId: string, skills: LoadedSkill[]) => void): () => void

  listLlmConnections(): Promise<LlmConnection[]>
  listLlmConnectionsWithStatus(): Promise<LlmConnectionWithStatus[]>
  setupLlmConnection(setup: LlmConnectionSetup): Promise<{ success: boolean; error?: string }>
  testLlmConnectionSetup(params: TestLlmConnectionParams): Promise<TestLlmConnectionResult>
  deleteLlmConnection(slug: string): Promise<{ success: boolean; error?: string }>
  setDefaultLlmConnection(slug: string): Promise<void>
  onLlmConnectionsChanged(callback: () => void): () => void
  getPiApiKeyProviders(): Promise<Array<{ key: string; label: string; placeholder: string }>>
  getPiProviderModels(provider: string): Promise<{ models: Array<{ id: string; name: string }>; totalCount: number }>
  getSessionModel(sessionId: string, workspaceId: string): Promise<string | null>
  setSessionModel(sessionId: string, workspaceId: string, model: string | null, connection?: string): Promise<void>

  getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings | null>
  updateWorkspaceSetting<K extends keyof WorkspaceSettings>(workspaceId: string, key: K, value: WorkspaceSettings[K]): Promise<void>
  getNetworkProxySettings(): Promise<NetworkProxySettings>
  setNetworkProxySettings(settings: NetworkProxySettings): Promise<void>

  getSystemTheme(): Promise<boolean>
  onSystemThemeChange(callback: (isDark: boolean) => void): () => void
  getColorTheme(): Promise<string>
  setColorTheme(themeId: string): Promise<void>
  changeLanguage?(language: string): Promise<void>

  openFileDialog(): Promise<string[]>
  readFileAttachment(path: string): Promise<FileAttachment | null>
  openUrl(url: string): Promise<void>
  openFile(path: string): Promise<void>
  showInFolder(path: string): Promise<void>
  openFolderDialog(): Promise<string | null>

  checkForUpdates(): Promise<UpdateInfo>
  getUpdateInfo(): Promise<UpdateInfo>
  installUpdate(): Promise<void>
  dismissUpdate(version: string): Promise<void>

  browserPane: {
    create(sessionId: string, url?: string): Promise<string>
    destroy(id: string): Promise<void>
    list(): Promise<BrowserInstanceInfo[]>
    navigate(id: string, url: string): Promise<void>
    focus(id: string): Promise<void>
    onStateChanged(callback: (state: BrowserInstanceInfo) => void): () => void
    onRemoved(callback: (id: string) => void): () => void
  }

  getRuntimeEnvironment(): 'electron' | 'web'
  getTransportConnectionState(): Promise<TransportConnectionState>
  onTransportConnectionStateChanged(callback: (state: TransportConnectionState) => void): () => void
  reconnectTransport(): Promise<void>
  isChannelAvailable(channel: string): boolean
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
