import { describe, expect, it } from 'bun:test'
import '../../../tests/setup/register-pi-model-resolver.ts'
import {
  authTypeRequiresEndpoint,
  authTypeToCredentialStorageType,
  defaultMidStreamBehavior,
  generateSlug,
  getDefaultModelForConnection,
  getDefaultModelsForConnection,
  getLlmCredentialKey,
  getMiniModel,
  getSummarizationModel,
  isCompatProvider,
  isDeniedMiniModelId,
  isLocalConnection,
  isPiProvider,
  isSessionConnectionUnavailable,
  isValidProviderAuthCombination,
  modelSupportsImages,
  resolveEffectiveConnectionSlug,
  resolveMidStreamBehavior,
} from '../llm-connections.ts'

describe('Pi-only LLM connections', () => {
  it('returns provider-filtered Pi models and a default from that list', () => {
    const models = getDefaultModelsForConnection('pi', 'anthropic')
    const ids = models.map(model => typeof model === 'string' ? model : model.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids).toContain(getDefaultModelForConnection('pi', 'anthropic'))
  })

  it('identifies native and compatible Pi providers', () => {
    expect(isPiProvider('pi')).toBe(true)
    expect(isPiProvider('pi_compat')).toBe(true)
    expect(isCompatProvider('pi_compat')).toBe(true)
    expect(isCompatProvider('pi')).toBe(false)
  })

  it('keeps the Lite authentication boundary explicit', () => {
    expect(authTypeToCredentialStorageType('api_key')).toBe('api_key')
    expect(authTypeToCredentialStorageType('api_key_with_endpoint')).toBe('api_key')
    expect(authTypeToCredentialStorageType('none')).toBeNull()
    expect(authTypeRequiresEndpoint('api_key_with_endpoint')).toBe(true)
    expect(authTypeRequiresEndpoint('api_key')).toBe(false)
  })

  it('recognizes loopback endpoints for keyless local models', () => {
    expect(isLocalConnection({ baseUrl: 'http://127.0.0.1:11434/v1' })).toBe(true)
    expect(isLocalConnection({ baseUrl: 'http://[::1]:11434/v1' })).toBe(true)
    expect(isLocalConnection({ baseUrl: 'https://models.example.com/v1' })).toBe(false)
  })

  it('rejects only the stale codex-mini alias', () => {
    expect(isDeniedMiniModelId('codex-mini-latest')).toBe(true)
    expect(isDeniedMiniModelId('pi/codex-mini-latest')).toBe(true)
    expect(isDeniedMiniModelId('gpt-5.6-luna')).toBe(false)
  })

  it('selects small models for mini and summarization work', () => {
    const connection = { providerType: 'pi' as const, piAuthProvider: 'openai', models: ['gpt-large', 'gpt-mini', 'gpt-small'] }
    expect(getMiniModel(connection)).toBe('gpt-mini')
    expect(getSummarizationModel(connection)).toBe('gpt-mini')
  })

  it('falls back to the last allowed model', () => {
    expect(getMiniModel({ providerType: 'pi', models: ['model-a', 'model-b'] })).toBe('model-b')
  })

  it('generates and validates connection slugs', () => {
    expect(generateSlug('DeepSeek Main')).toBe('deepseek-main')
    expect(isValidProviderAuthCombination('pi', 'api_key')).toBe(true)
    expect(isValidProviderAuthCombination('pi_compat', 'api_key_with_endpoint')).toBe(true)
    expect(isValidProviderAuthCombination('pi', 'api_key_with_endpoint')).toBe(false)
  })

  it('uses stable credential keys', () => {
    expect(getLlmCredentialKey('deepseek-main')).toBe('llm::deepseek-main::api_key')
  })

  it('uses native Pi steering unless overridden', () => {
    expect(defaultMidStreamBehavior('pi')).toBe('steer')
    expect(resolveMidStreamBehavior({ providerType: 'pi', midStreamBehavior: 'queue' })).toBe('queue')
  })

  it('resolves image support from custom endpoint metadata', () => {
    expect(modelSupportsImages({ providerType: 'pi_compat', customEndpoint: { api: 'openai-completions', supportsImages: true } }, 'custom')).toBe(true)
    expect(modelSupportsImages({ providerType: 'pi_compat', customEndpoint: { api: 'openai-completions', supportsImages: false } }, 'custom')).toBe(false)
  })

  it('resolves session, workspace, then global defaults', () => {
    const connections = [{ slug: 'global', isDefault: true }]
    expect(resolveEffectiveConnectionSlug('session', 'workspace', connections)).toBe('session')
    expect(resolveEffectiveConnectionSlug(undefined, 'workspace', connections)).toBe('workspace')
    expect(resolveEffectiveConnectionSlug(undefined, undefined, connections)).toBe('global')
  })

  it('detects unavailable selected connections', () => {
    expect(isSessionConnectionUnavailable('missing', [{ slug: 'present' }])).toBe(true)
    expect(isSessionConnectionUnavailable('present', [{ slug: 'present' }])).toBe(false)
    expect(isSessionConnectionUnavailable(undefined, [])).toBe(false)
  })
})
