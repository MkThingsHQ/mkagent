import { describe, expect, it } from 'bun:test'
import { apiSetupMethodToConnectionSetup, BASE_SLUG_FOR_METHOD, resolveSlugForMethod } from '../useOnboarding'

describe('Pi-only connection setup', () => {
  it('uses the Pi base slug', () => {
    expect(resolveSlugForMethod('pi_api_key', null, new Set())).toBe('pi-api-key')
  })

  it('exposes only Claude, ChatGPT, and API key setup methods', () => {
    expect(BASE_SLUG_FOR_METHOD).toEqual({
      claude_oauth: 'claude-max',
      pi_chatgpt_oauth: 'chatgpt-plus',
      pi_api_key: 'pi-api-key',
    })
  })

  it('generates a unique slug for a new connection', () => {
    expect(resolveSlugForMethod('pi_api_key', null, new Set(['pi-api-key']))).toBe('pi-api-key-2')
  })

  it('reuses the slug while editing', () => {
    expect(resolveSlugForMethod('pi_api_key', 'existing', new Set(['pi-api-key']))).toBe('existing')
  })

  it('preserves Pi provider, endpoint, model, and credential settings', () => {
    const setup = apiSetupMethodToConnectionSetup(
      'pi_api_key',
      {
        credential: 'sk-test',
        baseUrl: 'https://example.test/v1',
        connectionDefaultModel: 'model-a',
        models: ['model-a'],
        piAuthProvider: 'openai',
        modelSelectionMode: 'userDefined3Tier',
      },
      null,
      new Set(),
    )

    expect(setup).toMatchObject({
      slug: 'pi-api-key',
      credential: 'sk-test',
      baseUrl: 'https://example.test/v1',
      defaultModel: 'model-a',
      models: ['model-a'],
      piAuthProvider: 'openai',
      modelSelectionMode: 'userDefined3Tier',
    })
  })

  it('maps Claude OAuth identity to the Claude Max subscription connection', () => {
    const setup = apiSetupMethodToConnectionSetup(
      'claude_oauth',
      {
        oauthIdentity: {
          account: { uuid: 'account-1', emailAddress: 'user@example.test' },
          organization: { uuid: 'org-1', name: 'Example' },
        },
      },
      null,
      new Set(),
    )

    expect(setup).toEqual({
      slug: 'claude-max',
      credential: undefined,
      oauthIdentity: {
        account: { uuid: 'account-1', emailAddress: 'user@example.test' },
        organization: { uuid: 'org-1', name: 'Example' },
      },
    })
  })

  it('maps ChatGPT OAuth to a unique ChatGPT Plus slug', () => {
    expect(apiSetupMethodToConnectionSetup(
      'pi_chatgpt_oauth',
      {},
      null,
      new Set(['chatgpt-plus']),
    )).toEqual({ slug: 'chatgpt-plus-2', credential: undefined })
  })
})
