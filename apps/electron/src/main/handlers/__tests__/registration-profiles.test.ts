import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { RpcServer } from '@mkagent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { CHANNEL_MAP } from '../../../transport/channel-map'

const registeredChannels: string[] = []

mock.module('electron', () => ({
  ipcMain: {
    handle: () => {},
    on: () => {},
  },
  app: {
    isPackaged: false,
    getAppPath: () => '/',
    quit: () => {},
    dock: { setIcon: () => {}, setBadge: () => {} },
  },
  nativeTheme: { shouldUseDarkColors: false },
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => true }),
    createFromDataURL: () => ({}),
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showMessageBox: async () => ({ response: 0 }),
  },
  shell: {
    openExternal: async () => {},
    openPath: async () => '',
    showItemInFolder: () => {},
  },
  BrowserWindow: {
    fromWebContents: () => null,
    getFocusedWindow: () => null,
    getAllWindows: () => [],
  },
  BrowserView: class {},
  Menu: {
    buildFromTemplate: () => ({ popup: () => {} }),
  },
  session: {},
}))

function createMockServer(): RpcServer {
  return {
    handle(channel: string, _handler: unknown) {
      registeredChannels.push(channel)
    },
    push() {},
    async invokeClient() {},
    hasClientCapability() { return false },
    findClientsWithCapability() { return [] },
  }
}

function createMockDeps(): HandlerDeps {
  return {
    sessionManager: {} as HandlerDeps['sessionManager'],
    platform: {
      appRootPath: '',
      resourcesPath: '',
      isPackaged: false,
      appVersion: '0.0.0-test',
      isDebugMode: true,
      logger: console,
      imageProcessor: {
        getMetadata: async () => null,
        process: async () => Buffer.from(''),
      },
    },
    windowManager: {} as HandlerDeps['windowManager'],
    browserPaneManager: {
      onStateChange: () => {},
      onRemoved: () => {},
      onInteracted: () => {},
    } as unknown as NonNullable<HandlerDeps['browserPaneManager']>,
  }
}

async function getExpectedCoreChannels(): Promise<Set<string>> {
  // Core handler channels (now in server-core)
  const [
    auth, files, llm, sessions, settings, skills, system, workspace, onboarding,
  ] = await Promise.all([
    import('@mkagent/server-core/handlers/rpc/auth'),
    import('@mkagent/server-core/handlers/rpc/files'),
    import('@mkagent/server-core/handlers/rpc/llm-connections'),
    import('@mkagent/server-core/handlers/rpc/sessions'),
    import('@mkagent/server-core/handlers/rpc/settings'),
    import('@mkagent/server-core/handlers/rpc/skills'),
    import('@mkagent/server-core/handlers/rpc/system'),
    import('@mkagent/server-core/handlers/rpc/workspace'),
    import('@mkagent/server-core/handlers/rpc/onboarding'),
  ])

  return new Set([
    ...auth.HANDLED_CHANNELS,
    ...files.HANDLED_CHANNELS,
    ...llm.HANDLED_CHANNELS,
    ...sessions.HANDLED_CHANNELS,
    ...settings.HANDLED_CHANNELS,
    ...skills.HANDLED_CHANNELS,
    ...system.CORE_HANDLED_CHANNELS,
    ...workspace.CORE_HANDLED_CHANNELS,
    ...onboarding.HANDLED_CHANNELS,
  ])
}

async function getExpectedGuiChannels(): Promise<Set<string>> {
  const [browser, system, workspace, settings] = await Promise.all([
    import('../browser'),
    import('../system'),
    import('../workspace'),
    import('../settings'),
  ])

  return new Set([
    ...browser.HANDLED_CHANNELS,
    ...system.GUI_HANDLED_CHANNELS,
    ...workspace.GUI_HANDLED_CHANNELS,
    ...settings.GUI_HANDLED_CHANNELS,
  ])
}

describe('RPC handler profile registration', () => {
  beforeEach(() => {
    registeredChannels.length = 0
  })

  it('registerCoreRpcHandlers registers only core channels', async () => {
    const expected = await getExpectedCoreChannels()
    const { registerCoreRpcHandlers } = await import('../index')

    registerCoreRpcHandlers(createMockServer(), createMockDeps())

    const actual = new Set(registeredChannels.filter(ch => ch.includes(':')))
    expect([...expected].filter(ch => !actual.has(ch))).toEqual([])
    expect([...actual].filter(ch => !expected.has(ch))).toEqual([])
  })

  it('registerGuiRpcHandlers registers only gui channels', async () => {
    const expected = await getExpectedGuiChannels()
    const { registerGuiRpcHandlers } = await import('../index')

    registerGuiRpcHandlers(createMockServer(), createMockDeps())

    const actual = new Set(registeredChannels.filter(ch => ch.includes(':')))
    expect([...expected].filter(ch => !actual.has(ch))).toEqual([])
    expect([...actual].filter(ch => !expected.has(ch))).toEqual([])
  })

  it('registers all retained channels exactly once', async () => {
    const expected = new Set([
      ...await getExpectedCoreChannels(),
      ...await getExpectedGuiChannels(),
    ])
    const { registerAllRpcHandlers } = await import('../index')

    registerAllRpcHandlers(createMockServer(), createMockDeps())

    const appChannels = registeredChannels.filter(channel => channel.includes(':'))
    const actual = new Set(appChannels)
    expect([...expected].filter(channel => !actual.has(channel)).sort()).toEqual([])
    expect([...actual].filter(channel => !expected.has(channel)).sort()).toEqual([])

    const counts = new Map<string, number>()
    for (const channel of appChannels) counts.set(channel, (counts.get(channel) ?? 0) + 1)
    expect([...counts.entries()].filter(([, count]) => count > 1)).toEqual([])
  })

  it('backs every retained client API channel with a handler', async () => {
    const { HANDLED_CHANNELS: serverChannels } = await import('@mkagent/server-core/handlers/rpc/server')
    const handled = new Set([
      ...await getExpectedCoreChannels(),
      ...await getExpectedGuiChannels(),
      ...serverChannels,
    ])
    const missing = Object.values(CHANNEL_MAP)
      .filter(entry => entry.type === 'invoke')
      .map(entry => entry.channel)
      .filter(channel => !channel.startsWith('__') && !handled.has(channel))
      .sort()

    expect(missing).toEqual([])
  })
})
