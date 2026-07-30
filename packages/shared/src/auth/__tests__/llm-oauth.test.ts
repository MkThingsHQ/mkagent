import { describe, expect, it } from 'bun:test'
import {
  CHATGPT_OAUTH_CONFIG,
  CLAUDE_OAUTH_CONFIG,
  clearOAuthState,
  generateCallbackPage,
  hasValidOAuthState,
  parseClaudeOAuthIdentity,
  prepareChatGptOAuth,
  prepareClaudeOAuth,
} from '../index.ts'
import { CredentialManager } from '../../credentials/manager.ts'
import type { CredentialBackend } from '../../credentials/backends/types.ts'
import type { CredentialId, StoredCredential } from '../../credentials/types.ts'

describe('LLM subscription OAuth', () => {
  it('prepares the Craft ChatGPT PKCE flow for the desktop callback', () => {
    const flow = prepareChatGptOAuth()
    const url = new URL(flow.authUrl)

    expect(url.origin + url.pathname).toBe(CHATGPT_OAUTH_CONFIG.AUTH_URL)
    expect(url.searchParams.get('client_id')).toBe(CHATGPT_OAUTH_CONFIG.CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe(CHATGPT_OAUTH_CONFIG.REDIRECT_URI)
    expect(url.searchParams.get('scope')).toBe(CHATGPT_OAUTH_CONFIG.SCOPES)
    expect(url.searchParams.get('state')).toBe(flow.state)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('codex_cli_simplified_flow')).toBe('true')
    expect(flow.codeVerifier.length).toBeGreaterThanOrEqual(43)
  })

  it('prepares and clears the Craft Claude PKCE flow', () => {
    const url = new URL(prepareClaudeOAuth())

    expect(url.origin + url.pathname).toBe(CLAUDE_OAUTH_CONFIG.AUTH_URL)
    expect(url.searchParams.get('client_id')).toBe(CLAUDE_OAUTH_CONFIG.CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe(CLAUDE_OAUTH_CONFIG.REDIRECT_URI)
    expect(url.searchParams.get('scope')).toBe(CLAUDE_OAUTH_CONFIG.SCOPES)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(hasValidOAuthState()).toBe(true)

    clearOAuthState()
    expect(hasValidOAuthState()).toBe(false)
  })

  it('normalizes the optional Claude account and organization identity', () => {
    expect(parseClaudeOAuthIdentity({
      account: { uuid: 'account-1', email_address: 'user@example.test' },
      organization: { uuid: 'org-1', name: 'Example' },
    })).toEqual({
      account: { uuid: 'account-1', emailAddress: 'user@example.test' },
      organization: { uuid: 'org-1', name: 'Example' },
    })
  })

  it('uses MkAgent branding on the retained callback page', () => {
    const html = generateCallbackPage({
      title: 'Authorization Complete',
      isSuccess: true,
      appType: 'electron',
      deeplinkUrl: 'mkagent://auth-complete',
    })
    expect(html).toContain('<title>MkAgent - Authorization Complete</title>')
    expect(html).toContain('>MkAgent</a>')
    expect(html).not.toContain('Craft Agents')
  })
})

describe('LLM OAuth credential storage', () => {
  it('round-trips access, refresh, expiry, and ID tokens under the connection slug', async () => {
    const values = new Map<string, StoredCredential>()
    const key = (id: CredentialId) => `${id.type}:${id.connectionSlug}`
    const backend: CredentialBackend = {
      name: 'memory',
      priority: 1,
      isAvailable: async () => true,
      get: async id => values.get(key(id)) ?? null,
      set: async (id, credential) => { values.set(key(id), credential) },
      delete: async id => values.delete(key(id)),
      list: async () => [],
    }
    const manager = new CredentialManager()
    ;(manager as any).backends = [backend]
    ;(manager as any).writeBackend = backend
    ;(manager as any).initialized = true

    await manager.setLlmOAuth('chatgpt-plus', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 123456789,
      idToken: 'identity-token',
    })

    expect(await manager.getLlmOAuth('chatgpt-plus')).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 123456789,
      idToken: 'identity-token',
    })
    expect(await manager.hasLlmCredentials('chatgpt-plus', 'oauth')).toBe(true)
  })
})
