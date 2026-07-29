import { describe, expect, it } from 'bun:test'
import { apiSetupMethodToConnectionSetup, resolveSlugForMethod } from '../useOnboarding'

describe('Pi-only connection setup', () => {
  it('uses the Pi base slug', () => {
    expect(resolveSlugForMethod('pi_api_key', null, new Set())).toBe('pi-api-key')
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
})
