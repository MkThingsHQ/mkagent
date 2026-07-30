/**
 * Onboarding IPC handlers for Electron main process
 *
 * Handles workspace setup and configuration persistence.
 */
import { getLlmConnections, setSetupDeferred } from '@mkagent/shared/config'
import { RPC_CHANNELS } from '@mkagent/shared/protocol'
import type { RpcServer } from '@mkagent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import {
  clearOAuthState,
  exchangeClaudeCode,
  hasValidOAuthState,
  prepareClaudeOAuth,
} from '@mkagent/shared/auth'
import { getCredentialManager } from '@mkagent/shared/credentials'

// ============================================
// IPC Handlers
// ============================================

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.onboarding.GET_AUTH_STATE,
  RPC_CHANNELS.onboarding.START_CLAUDE_OAUTH,
  RPC_CHANNELS.onboarding.EXCHANGE_CLAUDE_CODE,
  RPC_CHANNELS.onboarding.HAS_CLAUDE_OAUTH_STATE,
  RPC_CHANNELS.onboarding.CLEAR_CLAUDE_OAUTH_STATE,
  RPC_CHANNELS.onboarding.DEFER_SETUP,
] as const

export function registerOnboardingHandlers(server: RpcServer, deps: HandlerDeps): void {
  const log = deps.platform.logger

  server.handle(RPC_CHANNELS.onboarding.GET_AUTH_STATE, async () => {
    const connections = getLlmConnections()
    const hasConnection = connections.length > 0
    return {
      setupNeeds: {
        isFullyConfigured: hasConnection,
        needsBillingConfig: !hasConnection,
      },
    }
  })

  server.handle(RPC_CHANNELS.onboarding.START_CLAUDE_OAUTH, async () => {
    try {
      return { success: true, authUrl: prepareClaudeOAuth() }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  server.handle(RPC_CHANNELS.onboarding.EXCHANGE_CLAUDE_CODE, async (_ctx, authorizationCode: string, connectionSlug: string) => {
    try {
      if (!hasValidOAuthState()) {
        return { success: false, error: 'OAuth session expired. Please start again.' }
      }
      const tokens = await exchangeClaudeCode(authorizationCode)
      await getCredentialManager().setLlmOAuth(connectionSlug, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      })
      const identity = tokens.account || tokens.organization
        ? { account: tokens.account, organization: tokens.organization }
        : undefined
      return { success: true, token: tokens.accessToken, identity }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  server.handle(RPC_CHANNELS.onboarding.HAS_CLAUDE_OAUTH_STATE, async () => hasValidOAuthState())
  server.handle(RPC_CHANNELS.onboarding.CLEAR_CLAUDE_OAUTH_STATE, async () => {
    clearOAuthState()
    return { success: true }
  })

  // User chose "Setup later" — persist so onboarding doesn't re-show on next launch
  server.handle(RPC_CHANNELS.onboarding.DEFER_SETUP, async () => {
    setSetupDeferred(true)
    log?.info('[Onboarding] User deferred setup')
    return { success: true }
  })
}
