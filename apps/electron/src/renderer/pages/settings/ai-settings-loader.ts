import type { ElectronAPI } from '../../../shared/types'

type AiSettingsApi = Pick<ElectronAPI,
  'getWorkspaces' | 'getDefaultThinkingLevel' | 'getExtendedPromptCache' |
  'getEnable1MContext' | 'getRtkEnabled' | 'getRtkStatus' | 'getCredentialHealth'>

/** Load the initial page as one snapshot, including the connection list and health banner.
 * Sequential RPCs used to insert whole sections above already-visible controls. */
export async function loadAiSettings(api: AiSettingsApi, refreshConnections: () => Promise<void>) {
  const [workspaces, thinking, extendedCache, enable1M, rtkEnabled, rtkStatus, health] = await Promise.all([
    api.getWorkspaces(),
    api.getDefaultThinkingLevel(),
    api.getExtendedPromptCache(),
    api.getEnable1MContext(),
    api.getRtkEnabled(),
    api.getRtkStatus(),
    api.getCredentialHealth(),
    refreshConnections(),
  ])
  return { workspaces, thinking, extendedCache, enable1M, rtkEnabled, rtkStatus, health }
}
