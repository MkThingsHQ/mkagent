import { openExternalUrl } from '@mkagent/ui'
import { WsRpcClient } from '../../../electron/src/transport/client'
import { buildClientApi } from '../../../electron/src/transport/build-api'
import { CHANNEL_MAP } from '../../../electron/src/transport/channel-map'
import type { ElectronAPI, TransportConnectionState } from '../../../electron/src/shared/types'

export interface WebApiOptions {
  serverUrl: string
  workspaceId?: string
}

function selectAndUploadFiles(): Promise<string[]> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.oncancel = () => resolve([])
    input.onchange = async () => {
      if (!input.files?.length) return resolve([])
      const form = new FormData()
      for (const file of input.files) form.append('files', file)
      try {
        const response = await fetch('/api/attachments', { method: 'POST', body: form, credentials: 'same-origin' })
        if (!response.ok) throw new Error(`Attachment upload failed (${response.status})`)
        const result = await response.json() as { paths: string[] }
        resolve(result.paths)
      } catch (error) {
        console.error('[attachments] upload failed', error)
        resolve([])
      }
    }
    input.click()
  })
}

export function createWebApi(options: WebApiOptions): { api: ElectronAPI; client: WsRpcClient } {
  const client = new WsRpcClient(options.serverUrl, {
    workspaceId: options.workspaceId,
    autoReconnect: true,
    mode: 'remote',
  })
  const baseApi = buildClientApi(client, CHANNEL_MAP, channel => client.isChannelAvailable(channel))
  const media = window.matchMedia('(prefers-color-scheme: dark)')

  const local: Partial<ElectronAPI> = {
    getRuntimeEnvironment: () => 'web',
    getWindowWorkspace: () => Promise.resolve(options.workspaceId ?? null),
    switchWorkspace: workspaceId => client.invoke(RPC_WINDOW_SWITCH, workspaceId),
    openWorkspace: () => Promise.resolve(),
    openSessionInNewWindow: (workspaceId, sessionId) => {
      window.open(`/?workspace=${encodeURIComponent(workspaceId)}&session=${encodeURIComponent(sessionId)}`, '_blank')
      return Promise.resolve()
    },
    getSystemTheme: () => Promise.resolve(media.matches),
    onSystemThemeChange: callback => {
      const listener = (event: MediaQueryListEvent) => callback(event.matches)
      media.addEventListener('change', listener)
      return () => media.removeEventListener('change', listener)
    },
    openUrl: async url => {
      const result = openExternalUrl(url)
      if (!result.opened) throw new Error(`Unable to open URL: ${result.reason}`)
    },
    openFile: () => Promise.resolve(),
    showInFolder: () => Promise.resolve(),
    openFolderDialog: () => Promise.resolve(null),
    openFileDialog: selectAndUploadFiles,
    checkForUpdates: () => Promise.resolve({ available: false, currentVersion: client.getServerVersion() ?? '', latestVersion: null, downloadState: 'idle', downloadProgress: 0 }),
    getUpdateInfo: () => Promise.resolve({ available: false, currentVersion: client.getServerVersion() ?? '', latestVersion: null, downloadState: 'idle', downloadProgress: 0 }),
    installUpdate: () => Promise.resolve(),
    dismissUpdate: () => Promise.resolve(),
    getTransportConnectionState: () => Promise.resolve(client.getConnectionState() as TransportConnectionState),
    onTransportConnectionStateChanged: callback => client.onConnectionStateChanged(state => callback(state as TransportConnectionState)),
    reconnectTransport: () => {
      client.reconnectNow()
      return Promise.resolve()
    },
    onReconnected: callback => {
      let wasDisconnected = client.getConnectionState().status !== 'connected'
      return client.onConnectionStateChanged(state => {
        if (state.status === 'connected' && wasDisconnected) {
          wasDisconnected = false
          callback(true)
        } else if (state.status !== 'connected') {
          wasDisconnected = true
        }
      })
    },
    getSystemWarnings: () => Promise.resolve({ vcredistMissing: false }),
    getFilePath: file => file.name,
    isChannelAvailable: channel => client.isChannelAvailable(channel),
  }

  const api = { ...baseApi, ...local } as ElectronAPI
  return { api, client }
}

const RPC_WINDOW_SWITCH = 'window:switchWorkspace'
