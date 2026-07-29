/**
 * Compatibility boundary for the upstream Craft renderer.
 *
 * MkAgent deliberately keeps a smaller Pi-only server contract. Retained
 * product surfaces use the real RPC methods already present on `api`; removed
 * Craft modules receive inert values here so the renderer itself stays synced
 * with upstream instead of accumulating UI forks.
 */
export function applyCraftRendererCompatibility(api: Record<string, any>, platform: string): void {
  const noopListener = () => () => {}
  const unavailable = (feature: string) => async () => ({
    success: false,
    error: `${feature} is not available in this MkAgent build`,
  })

  Object.assign(api, {
    getSetupNeeds: async () => ({ needsBillingConfig: false, needsCredentials: false, isFullyConfigured: true }),
    getSystemWarnings: async () => ({ vcredistMissing: false }),
    getAllDrafts: async () => ({}),
    setDraft: async () => undefined,
    getAppTheme: async () => null,
    onAppThemeChange: noopListener,
    getWindowFocusState: async () => true,
    onWindowFocusChange: noopListener,
    onReconnected: noopListener,
    onCloseRequested: noopListener,
    cancelCloseWindow: async () => undefined,
    confirmCloseWindow: async () => undefined,
    setTrafficLightsVisible: async () => undefined,
    isDebugMode: async () => false,
    debugLog: () => undefined,
    logout: async () => undefined,
    checkGitBash: async () => ({ platform, found: true }),
    browseForGitBash: async () => null,
    setGitBashPath: async () => ({ success: true }),
    getUnreadSummary: async () => ({ totalUnread: 0, hasUnreadByWorkspace: {} }),
    onUnreadSummaryChanged: noopListener,
    getSessionPermissionModeState: async () => null,
    getPendingPlanExecution: async () => null,
    respondToCredential: unavailable('Credential requests'),

    readFile: async (path: string) => {
      const result = await api.readFileAttachment(path)
      return result?.content ?? ''
    },
    readFileBinary: async () => new Uint8Array(),
    readFileDataUrl: async () => '',
    readFilePreviewDataUrl: async () => '',
    readUserAttachment: (path: string) => api.readFileAttachment(path),
    storeAttachment: async (_sessionId: string, attachment: unknown) => attachment,
    generateThumbnail: async () => null,
    killShell: unavailable('Shell control'),
    getTaskOutput: async () => null,

    getSources: async () => [],
    onSourcesChanged: noopListener,
    getProjects: async () => [],
    onProjectsChanged: noopListener,
    getProject: async () => null,
    getAutomations: async () => null,
    getAutomationLastExecuted: async () => ({}),
    getAutomationHistory: async () => [],
    onAutomationsChanged: noopListener,
    listStatuses: async () => [],
    onStatusesChanged: noopListener,
    reorderStatuses: async () => undefined,
    listLabels: async () => [],
    listViews: async () => [],
    onLabelsChanged: noopListener,
    getMessagingBindings: async () => [],
    getMessagingPendingSenders: async () => [],
    onMessagingBindingChanged: noopListener,
    onMessagingPendingChanged: noopListener,
    onMessagingPlatformStatus: noopListener,
    onWhatsAppEvent: noopListener,

    onMenuNewChat: noopListener,
    onMenuOpenSettings: noopListener,
    onMenuKeyboardShortcuts: noopListener,
    onMenuToggleFocusMode: noopListener,
    onMenuToggleSidebar: noopListener,
    onNotificationNavigate: noopListener,
    onBadgeDraw: noopListener,
    onBadgeDrawWindows: noopListener,
    showNotification: async () => undefined,
    refreshBadge: async () => undefined,
    setDockIconWithBadge: async () => undefined,
    showDeleteSessionConfirmation: async () => true,

    getDefaultPermissionsConfig: async () => ({ config: { safe: [], ask: [], allowAll: [] }, path: '' }),
    getWorkspacePermissionsConfig: async () => ({ config: null, path: '' }),
    onDefaultPermissionsChanged: noopListener,
    getRichToolDescriptions: async () => true,
    setRichToolDescriptions: async () => undefined,
    getExtendedPromptCache: async () => false,
    setExtendedPromptCache: async () => undefined,
    getEnable1MContext: async () => false,
    setEnable1MContext: async () => undefined,
    getRtkEnabled: async () => false,
    setRtkEnabled: async () => undefined,
    getRtkStatus: async () => ({ available: false }),
    getRtkGain: async () => null,
    getCredentialHealth: async () => ({ status: 'healthy', issues: [] }),
    getMcpTools: async () => ({ tools: [] }),
    getPiProviderBaseUrl: async () => null,
    getLatestReleaseVersion: async () => null,
    getReleaseNotes: async () => '',
    getDismissedUpdateVersion: async () => null,
    onUpdateAvailable: noopListener,
    onUpdateDownloadProgress: noopListener,
  })

  if (api.browserPane) api.browserPane.onInteracted = noopListener
}
