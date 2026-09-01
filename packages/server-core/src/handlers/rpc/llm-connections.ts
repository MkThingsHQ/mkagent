import { RPC_CHANNELS, type LlmConnectionSetup } from '@mkagent/shared/protocol'
import {
  addLlmConnection,
  deleteLlmConnection,
  getDefaultLlmConnection,
  getDefaultModelForConnection,
  getDefaultModelsForConnection,
  getLlmConnection,
  getLlmConnections,
  getPiApiKeyProviders,
  getPiProviderBaseUrl,
  isCompatProvider,
  parseValidationError,
  setDefaultLlmConnection,
  setSetupDeferred,
  touchLlmConnection,
  updateLlmConnection,
  type LlmConnection,
  type LlmConnectionWithStatus,
} from '@mkagent/shared/config'
import { getCredentialManager } from '@mkagent/shared/credentials'
import {
  resolveSetupTestConnectionHint,
  testBackendConnection,
  validateStoredBackendConnection,
} from '@mkagent/shared/agent/backend'
import { getModelRefreshService } from '@mkagent/server-core/model-fetchers'
import {
  buildBackendHostRuntimeContext,
  getWorkspaceOrThrow,
} from '@mkagent/server-core/handlers'
import {
  parseTestConnectionError,
  createBuiltInConnection,
  piAuthProviderDisplayName,
  resolveCustomEndpointSetup,
  setupTestRequiresApiKey,
  validateModelList,
  validateSetupTestInput,
} from '@mkagent/server-core/domain'
import type { RpcServer } from '@mkagent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import { randomUUID } from 'node:crypto'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.llmConnections.LIST,
  RPC_CHANNELS.llmConnections.LIST_WITH_STATUS,
  RPC_CHANNELS.llmConnections.GET,
  RPC_CHANNELS.llmConnections.GET_API_KEY,
  RPC_CHANNELS.llmConnections.SAVE,
  RPC_CHANNELS.llmConnections.DELETE,
  RPC_CHANNELS.llmConnections.TEST,
  RPC_CHANNELS.llmConnections.SET_DEFAULT,
  RPC_CHANNELS.llmConnections.SET_WORKSPACE_DEFAULT,
  RPC_CHANNELS.llmConnections.REFRESH_MODELS,
  RPC_CHANNELS.settings.SETUP_LLM_CONNECTION,
  RPC_CHANNELS.settings.TEST_LLM_CONNECTION_SETUP,
  RPC_CHANNELS.pi.GET_API_KEY_PROVIDERS,
  RPC_CHANNELS.pi.GET_PROVIDER_BASE_URL,
  RPC_CHANNELS.pi.GET_PROVIDER_MODELS,
  RPC_CHANNELS.chatgpt.START_OAUTH,
  RPC_CHANNELS.chatgpt.COMPLETE_OAUTH,
  RPC_CHANNELS.chatgpt.CANCEL_OAUTH,
  RPC_CHANNELS.chatgpt.GET_AUTH_STATUS,
  RPC_CHANNELS.chatgpt.LOGOUT,
] as const

function createConnection(setup: LlmConnectionSetup): LlmConnection {
  const baseUrl = setup.baseUrl?.trim() || undefined
  const baseSlug = setup.slug.replace(/-\d+$/, '')
  if (!baseUrl && (baseSlug === 'chatgpt-plus' || baseSlug === 'claude-max')) {
    const connection = createBuiltInConnection(setup.slug)
    const identity = setup.oauthIdentity
    if (identity?.account?.uuid) connection.oauthAccountUuid = identity.account.uuid
    if (identity?.account?.emailAddress) connection.oauthAccountEmail = identity.account.emailAddress
    if (identity?.organization?.uuid) connection.oauthOrganizationUuid = identity.organization.uuid
    if (identity?.organization?.name) connection.oauthOrganizationName = identity.organization.name
    if (identity?.account || identity?.organization) connection.oauthProfileVerifiedAt = Date.now()
    return connection
  }
  const customEndpoint = baseUrl ? setup.customEndpoint : undefined
  const custom = customEndpoint
    ? resolveCustomEndpointSetup({
        baseUrl,
        credential: setup.credential,
        customEndpointApi: customEndpoint.api,
      })
    : undefined
  const providerType = customEndpoint ? 'pi_compat' : 'pi'
  const piAuthProvider = custom?.piAuthProvider ?? setup.piAuthProvider
  const models = setup.models?.length
    ? setup.models
    : getDefaultModelsForConnection(providerType, piAuthProvider)
  const defaultModel = setup.defaultModel
    ?? getDefaultModelForConnection(providerType, piAuthProvider)
  const providerName = piAuthProvider
    ? piAuthProviderDisplayName(piAuthProvider)
    : null

  return {
    slug: setup.slug,
    name: custom?.name
      ?? (providerName ? `MkAgent Backend (${providerName})` : 'MkAgent Backend'),
    providerType,
    authType: custom?.authType ?? 'api_key',
    ...(baseUrl ? { baseUrl } : {}),
    ...(customEndpoint ? { customEndpoint } : {}),
    ...(piAuthProvider ? { piAuthProvider } : {}),
    models,
    ...(defaultModel ? { defaultModel } : {}),
    modelSelectionMode: setup.modelSelectionMode
      ?? (setup.models?.length ? 'userDefined3Tier' : 'automaticallySyncedFromProvider'),
    midStreamBehavior: 'steer',
    createdAt: Date.now(),
  }
}

export function registerLlmConnectionsHandlers(server: RpcServer, deps: HandlerDeps): void {
  const { sessionManager } = deps
  const refreshModelsInBackground = (slug: string, context: string) => {
    try {
      getModelRefreshService().refreshNow(slug).catch(error => {
        deps.platform.logger?.warn(`Model refresh after ${context} failed for ${slug}: ${error instanceof Error ? error.message : error}`)
      })
    } catch (error) {
      deps.platform.logger?.warn(`Model refresh service unavailable after ${context}: ${error instanceof Error ? error.message : error}`)
    }
  }

  server.handle(RPC_CHANNELS.settings.SETUP_LLM_CONNECTION, async (_ctx, setup: LlmConnectionSetup) => {
    try {
      const existing = getLlmConnection(setup.slug)
      if (setup.updateOnly && !existing) {
        await getCredentialManager().deleteLlmCredentials(setup.slug).catch(() => {})
        return { success: false, error: 'Connection not found.' }
      }

      const connection = createConnection(setup)
      if (connection.models?.length) {
        const validation = validateModelList(connection.models, connection.defaultModel)
        if (!validation.valid) return { success: false, error: validation.error }
        if (validation.resolvedDefaultModel) {
          connection.defaultModel = validation.resolvedDefaultModel
        }
      }
      if (isCompatProvider(connection.providerType) && !connection.defaultModel) {
        return { success: false, error: 'Default model is required for compatible endpoints.' }
      }

      const persisted = existing
        ? updateLlmConnection(setup.slug, { ...connection, slug: undefined } as Partial<Omit<LlmConnection, 'slug'>>)
        : addLlmConnection(connection)
      if (!persisted) return { success: false, error: 'Failed to save connection.' }

      const isMasked = setup.credential?.includes('••')
      if (connection.authType !== 'oauth' && setup.credential && !isMasked) {
        await getCredentialManager().setLlmApiKey(setup.slug, setup.credential)
      }
      if (!getDefaultLlmConnection()) setDefaultLlmConnection(setup.slug)
      setSetupDeferred(false)
      await sessionManager.reinitializeAuth()
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  server.handle(RPC_CHANNELS.settings.TEST_LLM_CONNECTION_SETUP, async (_ctx, params: {
    provider: 'pi'
    apiKey: string
    baseUrl?: string
    model?: string
    piAuthProvider?: string
    customEndpoint?: LlmConnection['customEndpoint']
  }) => {
    const validation = validateSetupTestInput(params)
    if (!validation.valid) return { success: false, error: validation.error }
    if (setupTestRequiresApiKey(params.baseUrl) && !params.apiKey.trim()) {
      return { success: false, error: 'API key is required' }
    }
    try {
      const connection = resolveSetupTestConnectionHint(params)
      const result = await testBackendConnection({
        provider: 'pi',
        apiKey: params.apiKey,
        model: params.model ?? '',
        baseUrl: params.baseUrl,
        connection,
        allowEmptyApiKey: !setupTestRequiresApiKey(params.baseUrl),
        hostRuntime: buildBackendHostRuntimeContext(deps.platform),
      })
      return result.success
        ? result
        : { success: false, error: parseTestConnectionError(result.error ?? 'Connection failed') }
    } catch (error) {
      return {
        success: false,
        error: parseTestConnectionError(error instanceof Error ? error.message : String(error)),
      }
    }
  })

  server.handle(RPC_CHANNELS.pi.GET_API_KEY_PROVIDERS, async () => getPiApiKeyProviders())
  server.handle(RPC_CHANNELS.pi.GET_PROVIDER_BASE_URL, async (_ctx, provider: string) => getPiProviderBaseUrl(provider))
  server.handle(RPC_CHANNELS.pi.GET_PROVIDER_MODELS, async (_ctx, provider: string) => {
    const { getModels } = await import('@earendil-works/pi-ai/compat')
    try {
      const models = getModels(provider as Parameters<typeof getModels>[0])
      return {
        models: [...models]
          .sort((a, b) => b.cost.output - a.cost.output || b.cost.input - a.cost.input)
          .map(model => ({
            id: model.id.startsWith('pi/') ? model.id : `pi/${model.id}`,
            name: model.name,
            costInput: model.cost.input,
            costOutput: model.cost.output,
            contextWindow: model.contextWindow,
            reasoning: model.reasoning,
          })),
        totalCount: models.length,
      }
    } catch {
      return { models: [], totalCount: 0 }
    }
  })

  interface PendingChatGptFlow {
    flowId: string
    state: string
    codeVerifier: string
    connectionSlug: string
    ownerClientId: string
    createdAt: number
  }
  const pendingChatGptFlows = new Map<string, PendingChatGptFlow>()
  const chatGptFlowTtlMs = 5 * 60 * 1000

  const cleanupExpiredChatGptFlows = () => {
    const now = Date.now()
    for (const [state, flow] of pendingChatGptFlows) {
      if (now - flow.createdAt > chatGptFlowTtlMs) pendingChatGptFlows.delete(state)
    }
  }

  server.handle(RPC_CHANNELS.chatgpt.START_OAUTH, async (ctx, connectionSlug: string) => {
    cleanupExpiredChatGptFlows()
    const { prepareChatGptOAuth } = await import('@mkagent/shared/auth')
    const prepared = prepareChatGptOAuth()
    const flowId = randomUUID()
    pendingChatGptFlows.set(prepared.state, {
      flowId,
      state: prepared.state,
      codeVerifier: prepared.codeVerifier,
      connectionSlug,
      ownerClientId: ctx.clientId,
      createdAt: Date.now(),
    })
    return { authUrl: prepared.authUrl, state: prepared.state, flowId }
  })

  server.handle(RPC_CHANNELS.chatgpt.COMPLETE_OAUTH, async (ctx, args: {
    flowId: string
    code: string
    state: string
  }) => {
    const flow = pendingChatGptFlows.get(args.state)
    if (!flow) throw new Error('Unknown or expired ChatGPT OAuth flow')
    if (flow.flowId !== args.flowId) throw new Error('Flow ID mismatch')
    if (flow.ownerClientId !== ctx.clientId) throw new Error('OAuth flow owned by different client')
    if (Date.now() - flow.createdAt > chatGptFlowTtlMs) {
      pendingChatGptFlows.delete(args.state)
      throw new Error('ChatGPT OAuth flow expired')
    }
    try {
      const { exchangeChatGptTokens } = await import('@mkagent/shared/auth')
      const tokens = await exchangeChatGptTokens(args.code, flow.codeVerifier)
      await getCredentialManager().setLlmOAuth(flow.connectionSlug, {
        accessToken: tokens.accessToken,
        idToken: tokens.idToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      })
      pendingChatGptFlows.delete(args.state)
      refreshModelsInBackground(flow.connectionSlug, 'ChatGPT auth')
      return { success: true }
    } catch (error) {
      pendingChatGptFlows.delete(args.state)
      return { success: false, error: error instanceof Error ? error.message : 'Token exchange failed' }
    }
  })

  server.handle(RPC_CHANNELS.chatgpt.CANCEL_OAUTH, async (ctx, args?: { state?: string }) => {
    if (args?.state) {
      const flow = pendingChatGptFlows.get(args.state)
      if (flow?.ownerClientId === ctx.clientId) pendingChatGptFlows.delete(args.state)
    }
    return { success: true }
  })

  server.handle(RPC_CHANNELS.chatgpt.GET_AUTH_STATUS, async (_ctx, connectionSlug: string) => {
    const credentials = await getCredentialManager().getLlmOAuth(connectionSlug)
    if (!credentials) return { authenticated: false }
    const expired = credentials.expiresAt && Date.now() > credentials.expiresAt - 5 * 60 * 1000
    return {
      authenticated: !expired || !!credentials.refreshToken,
      expiresAt: credentials.expiresAt,
      hasRefreshToken: !!credentials.refreshToken,
    }
  })

  server.handle(RPC_CHANNELS.chatgpt.LOGOUT, async (_ctx, connectionSlug: string) => {
    await getCredentialManager().deleteLlmCredentials(connectionSlug)
    return { success: true }
  })

  server.handle(RPC_CHANNELS.llmConnections.LIST, async (): Promise<LlmConnection[]> => getLlmConnections())
  server.handle(RPC_CHANNELS.llmConnections.LIST_WITH_STATUS, async (): Promise<LlmConnectionWithStatus[]> => {
    const manager = getCredentialManager()
    const defaultSlug = getDefaultLlmConnection()
    return Promise.all(getLlmConnections().map(async connection => ({
      ...connection,
      isAuthenticated: await manager.hasLlmCredentials(connection.slug, connection.authType),
      isDefault: connection.slug === defaultSlug,
    })))
  })
  server.handle(RPC_CHANNELS.llmConnections.GET, async (_ctx, slug: string) => getLlmConnection(slug))
  server.handle(RPC_CHANNELS.llmConnections.GET_API_KEY, async (_ctx, slug: string) => {
    const key = await getCredentialManager().getLlmApiKey(slug)
    if (!key) return null
    return key.length > 15 ? `${key.slice(0, 7)}••••••••${key.slice(-4)}` : '••••••••'
  })
  server.handle(RPC_CHANNELS.llmConnections.SAVE, async (_ctx, connection: LlmConnection) => {
    try {
      const existing = getLlmConnection(connection.slug)
      const success = existing
        ? updateLlmConnection(connection.slug, connection)
        : addLlmConnection(connection)
      if (!success) return { success: false, error: 'Failed to save connection' }
      sessionManager.refreshConnectionRuntime(connection.slug).catch(error => {
        deps.platform.logger.warn(`Runtime refresh failed: ${error instanceof Error ? error.message : error}`)
      })
      if (getDefaultLlmConnection() === connection.slug) await sessionManager.reinitializeAuth()
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })
  server.handle(RPC_CHANNELS.llmConnections.DELETE, async (_ctx, slug: string) => {
    if (!getLlmConnection(slug)) return { success: false, error: 'Connection not found' }
    const success = deleteLlmConnection(slug)
    if (success) {
      getModelRefreshService().stopConnection(slug)
      await getCredentialManager().deleteLlmCredentials(slug)
    }
    return { success }
  })
  server.handle(RPC_CHANNELS.llmConnections.TEST, async (_ctx, slug: string) => {
    const result = await validateStoredBackendConnection({
      slug,
      hostRuntime: buildBackendHostRuntimeContext(deps.platform),
    })
    if (!result.success) return { success: false, error: result.error }
    touchLlmConnection(slug)
    return { success: true }
  })
  server.handle(RPC_CHANNELS.llmConnections.SET_DEFAULT, async (_ctx, slug: string) => {
    const success = setDefaultLlmConnection(slug)
    if (success) await sessionManager.reinitializeAuth()
    return { success, error: success ? undefined : 'Connection not found' }
  })
  server.handle(RPC_CHANNELS.llmConnections.SET_WORKSPACE_DEFAULT, async (_ctx, workspaceId: string, slug: string | null) => {
    try {
      if (slug && !getLlmConnection(slug)) return { success: false, error: 'Connection not found' }
      const workspace = getWorkspaceOrThrow(workspaceId)
      const { loadWorkspaceConfig, saveWorkspaceConfig } = await import('@mkagent/shared/workspaces')
      const config = loadWorkspaceConfig(workspace.rootPath)
      if (!config) return { success: false, error: 'Failed to load workspace config' }
      config.defaults ??= {}
      if (slug) config.defaults.defaultLlmConnection = slug
      else delete config.defaults.defaultLlmConnection
      saveWorkspaceConfig(workspace.rootPath, config)
      return { success: true }
    } catch (error) {
      return { success: false, error: parseValidationError(error instanceof Error ? error.message : String(error)) }
    }
  })
  server.handle(RPC_CHANNELS.llmConnections.REFRESH_MODELS, async (_ctx, slug: string) => {
    if (!getLlmConnection(slug)) return { success: false, error: 'Connection not found' }
    try {
      await getModelRefreshService().refreshNow(slug)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })
}
