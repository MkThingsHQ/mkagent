export * from '@mkagent/shared/protocol'
export type { SettingsSubpage } from './settings-registry'

import type { StoredAttachment, Workspace } from '@mkagent/core/types'
import type { LlmConnection, LlmConnectionWithStatus, NetworkProxySettings } from '@mkagent/shared/config'
import type { ThinkingLevel } from '@mkagent/shared/agent/thinking-levels'
import type { PresetTheme } from '@mkagent/shared/config/theme'
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
  DeepLinkNavigation,
  TestLlmConnectionParams,
  TestLlmConnectionResult,
  UpdateInfo,
  WorkspaceSettings,
} from '@mkagent/shared/protocol'

export type TransportMode = 'local' | 'remote'
export type TransportConnectionStatus = 'idle' | 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'failed'

export interface BrowserPaneCreateOptions {
  id?: string
  show?: boolean
  bindToSessionId?: string
}

export interface BrowserEmptyStateLaunchPayload {
  route: string
  token?: string
}

export interface BrowserEmptyStateLaunchResult {
  ok: boolean
  handled: boolean
  reason?: string
}

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
  exportSession(sessionId: string): Promise<unknown>
  importSession(workspaceId: string, bundle: unknown, mode: 'move' | 'fork'): Promise<Session>
  markAllSessionsRead(workspaceId: string): Promise<void>
  respondToPermission(sessionId: string, requestId: string, allowed: boolean, alwaysAllow: boolean, options?: PermissionResponseOptions): Promise<boolean>
  onSessionEvent(callback: (event: SessionEvent) => void): () => void

  getWorkspaces(): Promise<Workspace[]>
  createWorkspace(folderPath: string, name: string): Promise<Workspace>
  checkWorkspaceSlug(slug: string): Promise<{ exists: boolean; path: string }>
  removeWorkspace(workspaceId: string): Promise<boolean>
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
  onDeepLinkNavigate(callback: (navigation: DeepLinkNavigation) => void): () => void

  listLlmConnections(): Promise<LlmConnection[]>
  listLlmConnectionsWithStatus(): Promise<LlmConnectionWithStatus[]>
  setupLlmConnection(setup: LlmConnectionSetup): Promise<{ success: boolean; error?: string }>
  testLlmConnectionSetup(params: TestLlmConnectionParams): Promise<TestLlmConnectionResult>
  deleteLlmConnection(slug: string): Promise<{ success: boolean; error?: string }>
  setDefaultLlmConnection(slug: string): Promise<void>
  getDefaultThinkingLevel(): Promise<ThinkingLevel>
  setDefaultThinkingLevel(level: ThinkingLevel): Promise<void>
  onLlmConnectionsChanged(callback: () => void): () => void
  getPiApiKeyProviders(): Promise<Array<{ key: string; label: string; placeholder: string }>>
  getPiProviderModels(provider: string): Promise<{ models: Array<{ id: string; name: string }>; totalCount: number }>
  getSessionModel(sessionId: string, workspaceId: string): Promise<string | null>
  setSessionModel(sessionId: string, workspaceId: string, model: string | null, connection?: string): Promise<void>

  getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings | null>
  updateWorkspaceSetting<K extends keyof WorkspaceSettings>(workspaceId: string, key: K, value: WorkspaceSettings[K]): Promise<void>
  getNetworkProxySettings(): Promise<NetworkProxySettings>
  setNetworkProxySettings(settings: NetworkProxySettings): Promise<void>
  getNotificationsEnabled(): Promise<boolean>
  setNotificationsEnabled(enabled: boolean): Promise<void>
  getKeepAwakeWhileRunning(): Promise<boolean>
  setKeepAwakeWhileRunning(enabled: boolean): Promise<void>
  getBrowserToolEnabled(): Promise<boolean>
  setBrowserToolEnabled(enabled: boolean): Promise<void>
  getAutoCapitalisation(): Promise<boolean>
  setAutoCapitalisation(enabled: boolean): Promise<void>
  getSpellCheck(): Promise<boolean>
  setSpellCheck(enabled: boolean): Promise<void>
  getSendMessageKey(): Promise<'enter' | 'cmd-enter'>
  setSendMessageKey(key: 'enter' | 'cmd-enter'): Promise<void>

  getSystemTheme(): Promise<boolean>
  getHomeDir(): Promise<string>
  readWorkspaceImage(workspaceId: string, relativePath: string): Promise<string | null>
  onSystemThemeChange(callback: (isDark: boolean) => void): () => void
  getColorTheme(): Promise<string>
  setColorTheme(themeId: string): Promise<void>
  loadPresetThemes(): Promise<PresetTheme[]>
  loadPresetTheme(themeId: string): Promise<PresetTheme | null>
  getWorkspaceColorTheme(workspaceId: string): Promise<string | null>
  setWorkspaceColorTheme(workspaceId: string, themeId: string | null): Promise<void>
  getAllWorkspaceThemes(): Promise<Record<string, string | undefined>>
  broadcastThemePreferences(preferences: { mode: string; colorTheme: string; font: string }): Promise<void>
  onThemePreferencesChange(callback: (preferences: { mode: string; colorTheme: string; font: string }) => void): () => void
  broadcastWorkspaceThemeChange(workspaceId: string, themeId: string | null): Promise<void>
  onWorkspaceThemeChange(callback: (data: { workspaceId: string; themeId: string | null }) => void): () => void
  readPreferences(): Promise<{ content: string; exists: boolean; path: string }>
  writePreferences(content: string): Promise<{ success: boolean; error?: string }>
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
    emptyStateLaunch(payload: BrowserEmptyStateLaunchPayload): Promise<BrowserEmptyStateLaunchResult>
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

export type { Workspace, LoadedSkill }
