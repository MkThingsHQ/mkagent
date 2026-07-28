import { RPC_CHANNELS } from '../shared/types'
import type { ChannelMap } from './build-api'

const invoke = (channel: string, transform?: (result: any) => any) => ({
  type: 'invoke' as const,
  channel,
  ...(transform ? { transform } : {}),
})
const listener = (channel: string) => ({ type: 'listener' as const, channel })

export const CHANNEL_MAP = {
  getSessions: invoke(RPC_CHANNELS.sessions.GET),
  getSessionMessages: invoke(RPC_CHANNELS.sessions.GET_MESSAGES),
  createSession: invoke(RPC_CHANNELS.sessions.CREATE),
  deleteSession: invoke(RPC_CHANNELS.sessions.DELETE),
  sendMessage: invoke(RPC_CHANNELS.sessions.SEND_MESSAGE),
  cancelProcessing: invoke(RPC_CHANNELS.sessions.CANCEL),
  sessionCommand: invoke(RPC_CHANNELS.sessions.COMMAND),
  respondToPermission: invoke(RPC_CHANNELS.sessions.RESPOND_TO_PERMISSION),
  onSessionEvent: listener(RPC_CHANNELS.sessions.EVENT),

  getWorkspaces: invoke(RPC_CHANNELS.workspaces.GET),
  createWorkspace: invoke(RPC_CHANNELS.workspaces.CREATE),
  getWindowWorkspace: invoke(RPC_CHANNELS.window.GET_WORKSPACE),
  switchWorkspace: invoke(RPC_CHANNELS.window.SWITCH_WORKSPACE),
  openWorkspace: invoke(RPC_CHANNELS.window.OPEN_WORKSPACE),
  openSessionInNewWindow: invoke(RPC_CHANNELS.window.OPEN_SESSION_IN_NEW_WINDOW),

  getSkills: invoke(RPC_CHANNELS.skills.GET),
  getSkillFiles: invoke(RPC_CHANNELS.skills.GET_FILES),
  deleteSkill: invoke(RPC_CHANNELS.skills.DELETE),
  openSkillInEditor: invoke(RPC_CHANNELS.skills.OPEN_EDITOR),
  openSkillInFinder: invoke(RPC_CHANNELS.skills.OPEN_FINDER),
  onSkillsChanged: listener(RPC_CHANNELS.skills.CHANGED),
  onDeepLinkNavigate: listener(RPC_CHANNELS.deeplink.NAVIGATE),

  listLlmConnections: invoke(RPC_CHANNELS.llmConnections.LIST),
  listLlmConnectionsWithStatus: invoke(RPC_CHANNELS.llmConnections.LIST_WITH_STATUS),
  setupLlmConnection: invoke(RPC_CHANNELS.settings.SETUP_LLM_CONNECTION),
  testLlmConnectionSetup: invoke(RPC_CHANNELS.settings.TEST_LLM_CONNECTION_SETUP),
  deleteLlmConnection: invoke(RPC_CHANNELS.llmConnections.DELETE),
  setDefaultLlmConnection: invoke(RPC_CHANNELS.llmConnections.SET_DEFAULT),
  onLlmConnectionsChanged: listener(RPC_CHANNELS.llmConnections.CHANGED),
  getPiApiKeyProviders: invoke(RPC_CHANNELS.pi.GET_API_KEY_PROVIDERS),
  getPiProviderModels: invoke(RPC_CHANNELS.pi.GET_PROVIDER_MODELS),
  getSessionModel: invoke(RPC_CHANNELS.sessions.GET_MODEL),
  setSessionModel: invoke(RPC_CHANNELS.sessions.SET_MODEL),

  getWorkspaceSettings: invoke(RPC_CHANNELS.workspace.SETTINGS_GET),
  updateWorkspaceSetting: invoke(RPC_CHANNELS.workspace.SETTINGS_UPDATE),
  getNetworkProxySettings: invoke(RPC_CHANNELS.settings.GET_NETWORK_PROXY),
  setNetworkProxySettings: invoke(RPC_CHANNELS.settings.SET_NETWORK_PROXY),
  getColorTheme: invoke(RPC_CHANNELS.theme.GET_COLOR_THEME),
  setColorTheme: invoke(RPC_CHANNELS.theme.SET_COLOR_THEME),
  getSystemTheme: invoke(RPC_CHANNELS.theme.GET_SYSTEM_PREFERENCE),
  onSystemThemeChange: listener(RPC_CHANNELS.theme.SYSTEM_CHANGED),

  openFileDialog: invoke(RPC_CHANNELS.file.OPEN_DIALOG),
  readFileAttachment: invoke(RPC_CHANNELS.file.READ_ATTACHMENT),
  openUrl: invoke(RPC_CHANNELS.shell.OPEN_URL),
  openFile: invoke(RPC_CHANNELS.shell.OPEN_FILE),
  showInFolder: invoke(RPC_CHANNELS.shell.SHOW_IN_FOLDER),
  openFolderDialog: invoke(RPC_CHANNELS.dialog.OPEN_FOLDER),

  checkForUpdates: invoke(RPC_CHANNELS.update.CHECK),
  getUpdateInfo: invoke(RPC_CHANNELS.update.GET_INFO),
  installUpdate: invoke(RPC_CHANNELS.update.INSTALL),
  dismissUpdate: invoke(RPC_CHANNELS.update.DISMISS),

  'browserPane.create': invoke(RPC_CHANNELS.browserPane.CREATE),
  'browserPane.destroy': invoke(RPC_CHANNELS.browserPane.DESTROY),
  'browserPane.list': invoke(RPC_CHANNELS.browserPane.LIST),
  'browserPane.navigate': invoke(RPC_CHANNELS.browserPane.NAVIGATE),
  'browserPane.focus': invoke(RPC_CHANNELS.browserPane.FOCUS),
  'browserPane.onStateChanged': listener(RPC_CHANNELS.browserPane.STATE_CHANGED),
  'browserPane.onRemoved': listener(RPC_CHANNELS.browserPane.REMOVED),
} satisfies ChannelMap
