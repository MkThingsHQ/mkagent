import i18n from 'i18next'
import { toast } from 'sonner'
import { openExternalUrl } from '@mkagent/ui'
import { WsRpcClient } from '../../../electron/src/transport/client'
import { buildClientApi } from '../../../electron/src/transport/build-api'
import { CHANNEL_MAP } from '../../../electron/src/transport/channel-map'
import type { ElectronAPI, TransportConnectionState } from '../../../electron/src/shared/types'

export interface WebApiOptions {
  serverUrl: string
  workspaceId?: string
}

const darkMediaQuery = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

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
        toast.error(error instanceof Error ? error.message : 'Attachment upload failed')
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
  const local: Partial<ElectronAPI> = {
    getVersions: () => ({ node: 'n/a', chrome: navigator.userAgent, electron: 'web' }),
    getRuntimeEnvironment: () => 'web',
    isDebugMode: () => Promise.resolve(import.meta.env.DEV),
    getWindowWorkspace: () => Promise.resolve(options.workspaceId ?? null),
    getWindowMode: () => Promise.resolve('main'),
    switchWorkspace: workspaceId => client.invoke(RPC_WINDOW_SWITCH, workspaceId),
    openWorkspace: () => Promise.resolve(),
    openSessionInNewWindow: (workspaceId, sessionId) => {
      const params = new URLSearchParams({ workspace: workspaceId, session: sessionId })
      window.open(`${window.location.origin}/?${params}`, '_blank')
      return Promise.resolve()
    },
    closeWindow: () => Promise.resolve(),
    confirmCloseWindow: () => Promise.resolve(),
    cancelCloseWindow: () => Promise.resolve(),
    onCloseRequested: () => () => {},
    setTrafficLightsVisible: () => Promise.resolve(),
    getWindowFocusState: () => Promise.resolve(document.hasFocus()),
    onWindowFocusChange: callback => {
      const onFocus = () => callback(true)
      const onBlur = () => callback(false)
      window.addEventListener('focus', onFocus)
      window.addEventListener('blur', onBlur)
      return () => {
        window.removeEventListener('focus', onFocus)
        window.removeEventListener('blur', onBlur)
      }
    },
    getSystemTheme: () => Promise.resolve(darkMediaQuery?.matches ?? false),
    onSystemThemeChange: callback => {
      if (!darkMediaQuery) return () => {}
      const listener = (event: MediaQueryListEvent) => callback(event.matches)
      darkMediaQuery.addEventListener('change', listener)
      return () => darkMediaQuery.removeEventListener('change', listener)
    },
    openUrl: url => {
      const result = openExternalUrl(url)
      if (!result.opened) {
        if (result.reason === 'dangerous') {
          toast.error(`Blocked unsafe URL (${result.detail})`)
        } else if (result.reason === 'internal-deeplink') {
          console.warn('[openUrl] mkagent:// deep links require the desktop app')
        } else {
          console.warn('[openUrl] Malformed URL:', url)
        }
      }
      return Promise.resolve()
    },
    openFile: () => Promise.resolve(),
    showInFolder: () => Promise.resolve(),
    openFolderDialog: () => Promise.resolve(null),
    openFileDialog: selectAndUploadFiles,
    checkForUpdates: () => Promise.resolve({ available: false, currentVersion: client.getServerVersion() ?? '', latestVersion: null, downloadState: 'idle', downloadProgress: 0 }),
    getUpdateInfo: () => Promise.resolve({ available: false, currentVersion: client.getServerVersion() ?? '', latestVersion: null, downloadState: 'idle', downloadProgress: 0 }),
    installUpdate: () => Promise.resolve(),
    dismissUpdate: () => Promise.resolve(),
    getDismissedUpdateVersion: () => Promise.resolve(null),
    onUpdateAvailable: () => () => {},
    onUpdateDownloadProgress: () => () => {},
    getReleaseNotes: () => client.invoke('releaseNotes:get'),
    getLatestReleaseVersion: () => client.invoke('releaseNotes:getLatestVersion'),
    onMenuNewChat: () => () => {},
    onMenuOpenSettings: () => () => {},
    onMenuKeyboardShortcuts: () => () => {},
    onMenuToggleFocusMode: () => () => {},
    onMenuToggleSidebar: () => () => {},
    onDeepLinkNavigate: () => () => {},
    menuQuit: () => Promise.resolve(),
    menuNewWindow: () => {
      window.open(window.location.href, '_blank')
      return Promise.resolve()
    },
    menuMinimize: () => Promise.resolve(),
    menuMaximize: () => Promise.resolve(),
    menuZoomIn: () => Promise.resolve(),
    menuZoomOut: () => Promise.resolve(),
    menuZoomReset: () => Promise.resolve(),
    menuToggleDevTools: () => Promise.resolve(),
    menuUndo: () => {
      document.execCommand('undo')
      return Promise.resolve()
    },
    menuRedo: () => {
      document.execCommand('redo')
      return Promise.resolve()
    },
    menuCut: () => {
      document.execCommand('cut')
      return Promise.resolve()
    },
    menuCopy: () => {
      document.execCommand('copy')
      return Promise.resolve()
    },
    menuPaste: () => {
      document.execCommand('paste')
      return Promise.resolve()
    },
    menuSelectAll: () => {
      document.execCommand('selectAll')
      return Promise.resolve()
    },
    refreshBadge: () => Promise.resolve(),
    setDockIconWithBadge: () => Promise.resolve(),
    onBadgeDraw: () => () => {},
    onBadgeDrawWindows: () => () => {},
    showNotification: async (title, body) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body })
      }
    },
    onNotificationNavigate: () => () => {},
    openSkillInEditor: () => Promise.resolve(),
    openSkillInFinder: () => Promise.resolve(),
    showDeleteSessionConfirmation: name => Promise.resolve(window.confirm(i18n.t('dialog.deleteSessionConfirmation', { name }))),
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
