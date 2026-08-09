import { describe, expect, it } from 'bun:test'
import {
  accountToCredentialId,
  credentialIdToAccount,
  SOURCE_CREDENTIAL_TYPES,
} from '../types.ts'

describe('credential account compatibility', () => {
  it('preserves existing connection-scoped LLM accounts', () => {
    const id = { type: 'llm_oauth' as const, connectionSlug: 'chatgpt' }
    expect(credentialIdToAccount(id)).toBe('llm_oauth::chatgpt')
    expect(accountToCredentialId('llm_oauth::chatgpt')).toEqual(id)
  })

  it('round-trips all workspace Source credential types', () => {
    for (const type of SOURCE_CREDENTIAL_TYPES) {
      const id = { type, workspaceId: 'workspace-1', sourceId: 'github' }
      const account = `${type}::workspace-1::github`
      expect(credentialIdToAccount(id)).toBe(account)
      expect(accountToCredentialId(account)).toEqual(id)
    }
  })

  it('rejects incomplete or malformed account identifiers', () => {
    expect(accountToCredentialId('source_oauth::workspace-only')).toBeNull()
    expect(accountToCredentialId('llm_api_key::')).toBeNull()
    expect(() => credentialIdToAccount({ type: 'source_bearer', workspaceId: 'workspace-1' })).toThrow()
  })
})
