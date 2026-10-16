import { describe, expect, it } from 'bun:test'
import '../../../tests/setup/register-pi-model-resolver.ts'
import {
  authTypeRequiresEndpoint,
  authTypeToCredentialType,
  authTypeToCredentialStorageType,
  defaultMidStreamBehavior,
  generateSlug,
  getDefaultModelForConnection,
  getDefaultModelsForConnection,
  getLlmCredentialKey,
  getMiniModel,
  getSummarizationModel,
  registerPiModelResolver,
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
import { getPiModelsForAuthProvider } from '../models-pi.ts'

describe('Pi-only LLM connections', () => {
  it('returns provider-filtered Pi models and a default from that list', () => {
    const models = getDefaultModelsForConnection('pi', 'anthropic')
    const ids = models.map(model => typeof model === 'string' ? model : model.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids).toContain(getDefaultModelForConnection('pi', 'anthropic'))
  })

  it('ranks supported Bedrock inference profiles ahead of retired snapshots', () => {
    const model = (id: string) => ({
      id,
      name: id,
      shortName: id,
      description: id,
      provider: 'pi' as const,
      contextWindow: 200_000,
    })
    registerPiModelResolver(() => [
      model('pi/us.anthropic.claude-opus-4-5-20251101-v1:0'),
      model('pi/us.anthropic.claude-opus-4-8'),
    ])

    try {
      expect(getDefaultModelForConnection('pi', 'amazon-bedrock')).toBe('pi/us.anthropic.claude-opus-4-8')
    } finally {
      registerPiModelResolver(provider => getPiModelsForAuthProvider(provider ?? ''))
    }
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
    expect(authTypeToCredentialStorageType('oauth')).toBe('oauth')
    expect(authTypeToCredentialType('oauth')).toBe('oauth_token')
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
    expect(isValidProviderAuthCombination('pi', 'oauth')).toBe(true)
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

// ============================================================
// getMiniModel — utility model for titles, summaries, call_llm
// ============================================================

describe('getMiniModel', () => {
  it('picks GPT-6 Luna for a ChatGPT account, not the last catalog entry', () => {
    // A real ChatGPT Plus model list after the Pi 1.1.0 refresh: no "mini"/"flash" name,
    // and gpt-6.1-sol ($2/$10) is last. gpt-6-luna is $0.10/$0.50.
    const models = ['pi/gpt-5.3-codex-spark', 'pi/gpt-5.5', 'pi/gpt-5.6-luna', 'pi/gpt-5.6-sol', 'pi/gpt-5.6-terra',
      'pi/gpt-6-astra', 'pi/gpt-6-luna', 'pi/gpt-6-sol', 'pi/gpt-6.1-sol']
    expect(getMiniModel({ providerType: 'pi', piAuthProvider: 'openai-codex', models })).toBe('pi/gpt-6-luna')
    // Older lists without gpt-6-luna fall back to the next preferred entry.
    expect(getMiniModel({ providerType: 'pi', piAuthProvider: 'openai-codex', models: models.filter(m => m !== 'pi/gpt-6-luna') }))
      .toBe('pi/gpt-5.6-luna')
  })

  it('prefers Luna over the "mini" keyword match for OpenAI API keys', () => {
    expect(getMiniModel({ providerType: 'pi', piAuthProvider: 'openai', models: ['pi/gpt-6-astra', 'pi/gpt-5.4-mini', 'pi/gpt-6-luna'] }))
      .toBe('pi/gpt-6-luna')
  })

  it('matches Bedrock inference profiles and Pi Anthropic connections by bare id', () => {
    expect(getMiniModel({ providerType: 'pi', piAuthProvider: 'amazon-bedrock',
      models: ['pi/us.anthropic.claude-opus-5-5', 'pi/us.anthropic.claude-haiku-4-5-20251001-v1:0', 'pi/us.anthropic.claude-haiku-5-5'] }))
      .toBe('pi/us.anthropic.claude-haiku-5-5')
    expect(getMiniModel({ providerType: 'pi', piAuthProvider: 'anthropic', models: ['pi/claude-opus-5-5', 'pi/claude-haiku-5-5', 'pi/claude-sonnet-5'] }))
      .toBe('pi/claude-haiku-5-5')
  })

  it('uses Kimi K2.6 for Moonshot', () => {
    expect(getMiniModel({ providerType: 'pi', piAuthProvider: 'moonshotai', models: ['pi/kimi-k3', 'pi/kimi-k2.6'] })).toBe('pi/kimi-k2.6')
  })

  it('keeps the keyword search (whole tokens: "gemini" is not "mini") for other providers and Anthropic connections', () => {
    expect(getMiniModel({ providerType: 'pi', piAuthProvider: 'google', models: ['pi/gemini-2.5-pro', 'pi/gemini-2.5-flash'] })).toBe('pi/gemini-2.5-flash')
    expect(getMiniModel({ providerType: 'pi', piAuthProvider: 'anthropic', models: ['claude-opus-5-5', 'claude-haiku-5-5', 'claude-haiku-4-5-20251001'] })).toBe('claude-haiku-5-5')
  })

  it('defaults Cloudflare AI Gateway to Opus 5.5 with Haiku 4.5 as the utility model', () => {
    expect(getDefaultModelForConnection('pi', 'cloudflare-ai-gateway')).toBe('pi/claude-opus-5-5')
    const models = getDefaultModelsForConnection('pi', 'cloudflare-ai-gateway').map(m => typeof m === 'string' ? m : m.id)
    expect(getMiniModel({ providerType: 'pi', piAuthProvider: 'cloudflare-ai-gateway', models })).toBe('pi/claude-haiku-4-5')
  })
})
