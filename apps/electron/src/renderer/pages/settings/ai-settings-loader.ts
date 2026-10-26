import type { ElectronAPI } from '../../../shared/types'

type AiSettingsApi = Pick<ElectronAPI,
  'getAutoCompactWindow' | 'getWorkspaces' | 'getDefaultThinkingLevel' | 'getExtendedPromptCache' |
  'getEnable1MContext' | 'getRtkEnabled' | 'getRtkStatus' | 'getCredentialHealth'>

/** Load the initial page as one snapshot, including the connection list and health banner.
 * Sequential RPCs used to insert whole sections above already-visible controls. */
export async function loadAiSettings(api: AiSettingsApi, refreshConnections: () => Promise<void>) {
  const [autoCompactWindow, workspaces, thinking, extendedCache, enable1M, rtkEnabled, rtkStatus, health] = await Promise.all([
    api.getAutoCompactWindow(),
    api.getWorkspaces(),
    api.getDefaultThinkingLevel(),
    api.getExtendedPromptCache(),
    api.getEnable1MContext(),
    api.getRtkEnabled(),
    api.getRtkStatus(),
    api.getCredentialHealth(),
    refreshConnections(),
  ])
  return { autoCompactWindow, workspaces, thinking, extendedCache, enable1M, rtkEnabled, rtkStatus, health }
}
