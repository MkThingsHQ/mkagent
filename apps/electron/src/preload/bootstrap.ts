import '@sentry/electron/preload'
import { contextBridge, ipcRenderer, shell, webUtils } from 'electron'
import {
  CLIENT_BROWSER_INVOKE,
  CLIENT_CONFIRM_DIALOG,
  CLIENT_OPEN_EXTERNAL,
  CLIENT_OPEN_FILE_DIALOG,
  CLIENT_OPEN_PATH,
  CLIENT_SHOW_IN_FOLDER,
  LOCAL_CLIENT_CAPABILITIES,
  type BrowserCapabilityRequest,
  type ConfirmDialogSpec,
  type FileDialogSpec,
} from '@mkagent/server-core/transport'
import { WsRpcClient, type TransportConnectionState } from '../transport/client'
import { buildClientApi } from '../transport/build-api'
import { CHANNEL_MAP } from '../transport/channel-map'
import { createCallbackServer, CHATGPT_OAUTH_CONFIG } from '@mkagent/shared/auth'
import { RPC_CHANNELS } from '@mkagent/shared/protocol'

const webContentsId = ipcRenderer.sendSync('__get-web-contents-id') as number
const workspaceId = ipcRenderer.sendSync('__get-workspace-id') as string
const port = ipcRenderer.sendSync('__get-ws-port') as number
const token = ipcRenderer.sendSync('__get-ws-token') as string

const client = new WsRpcClient(`ws://127.0.0.1:${port}`, {
  token,
  workspaceId,
  webContentsId,
  autoReconnect: true,
  mode: 'local',
  clientCapabilities: [...LOCAL_CLIENT_CAPABILITIES],
})

client.handleCapability(CLIENT_OPEN_EXTERNAL, (url: string) => shell.openExternal(url))
client.handleCapability(CLIENT_OPEN_PATH, async (path: string) => ({ error: await shell.openPath(path) || undefined }))
client.handleCapability(CLIENT_SHOW_IN_FOLDER, (path: string) => shell.showItemInFolder(path))
client.handleCapability(CLIENT_CONFIRM_DIALOG, (spec: ConfirmDialogSpec) => ipcRenderer.invoke('__dialog:showMessageBox', spec))
client.handleCapability(CLIENT_OPEN_FILE_DIALOG, (spec: FileDialogSpec) => ipcRenderer.invoke('__dialog:showOpenDialog', spec))
client.handleCapability(CLIENT_BROWSER_INVOKE, (request: BrowserCapabilityRequest) => ipcRenderer.invoke('__browser:invoke', request))
client.connect()

const api = buildClientApi(client, CHANNEL_MAP, channel => client.isChannelAvailable(channel)) as any
api.getRuntimeEnvironment = () => 'electron'
api.getTransportConnectionState = () => Promise.resolve(client.getConnectionState())
api.onTransportConnectionStateChanged = (callback: (state: TransportConnectionState) => void) => client.onConnectionStateChanged(callback)
api.reconnectTransport = () => {
  client.reconnectNow()
  return Promise.resolve()
}
api.onReconnected = (callback: (isStale: boolean) => void) => {
  let wasDisconnected = client.getConnectionState().status !== 'connected'
  return client.onConnectionStateChanged(state => {
    if (state.status === 'connected' && wasDisconnected) {
      wasDisconnected = false
      callback(true)
    } else if (state.status !== 'connected') {
      wasDisconnected = true
    }
  })
}
api.getSystemWarnings = async () => ({
  vcredistMissing: process.platform === 'win32' && process.env.MKAGENT_VCREDIST_MISSING === '1',
})
api.getFilePath = (file: File) => webUtils.getPathForFile(file)
api.changeLanguage = (language: string) => ipcRenderer.invoke('__i18n:changeLanguage', language)

api.startClaudeOAuth = async () => {
  try {
    const result = await client.invoke(RPC_CHANNELS.onboarding.START_CLAUDE_OAUTH)
    if (result.success && result.authUrl) await shell.openExternal(result.authUrl)
    return result
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Claude OAuth failed' }
  }
}

api.startChatGptOAuth = async (connectionSlug: string) => {
  let callbackServer: Awaited<ReturnType<typeof createCallbackServer>> | null = null
  let state: string | undefined
  try {
    callbackServer = await createCallbackServer({
      appType: 'electron',
      port: CHATGPT_OAUTH_CONFIG.CALLBACK_PORT,
      callbackPaths: ['/auth/callback'],
    })
    const started = await client.invoke(RPC_CHANNELS.chatgpt.START_OAUTH, connectionSlug)
    state = started.state
    await shell.openExternal(started.authUrl)
    const callback = await callbackServer.promise
    if (callback.query.error) {
      await client.invoke(RPC_CHANNELS.chatgpt.CANCEL_OAUTH, { state })
      return { success: false, error: callback.query.error_description || callback.query.error }
    }
    if (!callback.query.code) {
      await client.invoke(RPC_CHANNELS.chatgpt.CANCEL_OAUTH, { state })
      return { success: false, error: 'No authorization code received' }
    }
    return await client.invoke(RPC_CHANNELS.chatgpt.COMPLETE_OAUTH, {
      flowId: started.flowId,
      code: callback.query.code,
      state,
    })
  } catch (error) {
    if (state) client.invoke(RPC_CHANNELS.chatgpt.CANCEL_OAUTH, { state }).catch(() => {})
    return { success: false, error: error instanceof Error ? error.message : 'ChatGPT OAuth flow failed' }
  } finally {
    callbackServer?.close()
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
