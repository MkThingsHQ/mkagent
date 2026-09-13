import { describe, it, expect } from 'bun:test';
import { getPiApiKeyProviders, getPiModelsForAuthProvider } from '../src/config/models-pi.ts';

describe('models-pi filtering', () => {
  it('excludes codex-mini-latest for openai models', () => {
    const models = getPiModelsForAuthProvider('openai');
    const ids = models.map(m => m.id);
    expect(ids.includes('pi/codex-mini-latest')).toBe(false);
  });

  it('excludes all gpt-4* models for openai models', () => {
    const models = getPiModelsForAuthProvider('openai');
    const ids = models.map(m => m.id);
    expect(ids.some(id => id.startsWith('pi/gpt-4'))).toBe(false);
  });

  it('keeps Claude Opus 4.6 models in Anthropic catalogs', () => {
    // TODO(opus-4.6-sunset): flip these back to exclusion when 4.6 is deprecated.
    const anthropicIds = getPiModelsForAuthProvider('anthropic').map(m => m.id);
    expect(anthropicIds).toContain('pi/claude-opus-4-6');

    const bedrockIds = getPiModelsForAuthProvider('amazon-bedrock').map(m => m.id);
    expect(bedrockIds.some(id => id.includes('claude-opus-4-6'))).toBe(true);
  });

  it('includes DeepSeek in the Pi API key provider list with a human-readable label', () => {
    const providers = getPiApiKeyProviders();
    expect(providers.some(provider => provider.key === 'deepseek' && provider.label === 'DeepSeek')).toBe(true);
  });

  it('returns current DeepSeek models from the Pi SDK catalog', () => {
    const models = getPiModelsForAuthProvider('deepseek');
    const ids = models.map(m => m.id);
    expect(ids).toContain('pi/deepseek-v4-flash');
    expect(ids).toContain('pi/deepseek-v4-pro');
  });

  it('includes Moonshot AI in the Pi API key provider list with human-readable labels', () => {
    const providers = getPiApiKeyProviders();
    expect(providers.some(provider => provider.key === 'moonshotai' && provider.label === 'Moonshot AI')).toBe(true);
    expect(providers.some(provider => provider.key === 'moonshotai-cn' && provider.label === 'Moonshot AI (CN)')).toBe(true);
  });

  it('returns Claude Opus 5 from the Pi SDK catalog for Anthropic and Bedrock', () => {
    const anthropicIds = getPiModelsForAuthProvider('anthropic').map(m => m.id);
    expect(anthropicIds).toContain('pi/claude-opus-5');

    // Bedrock exposes Opus 5 only as regional inference profiles (us./eu./global.).
    const bedrockIds = getPiModelsForAuthProvider('amazon-bedrock').map(m => m.id);
    expect(bedrockIds).toContain('pi/us.anthropic.claude-opus-5');
  });

  it('returns the DeepSeek V4 Flash vision model from the Pi SDK catalog', () => {
    const ids = getPiModelsForAuthProvider('deepseek').map(m => m.id);
    expect(ids).toContain('pi/deepseek-v4-flash-vision-exp');
  });

  it('returns GPT-6 Astra from the Pi SDK catalog for OpenAI API keys and ChatGPT accounts', () => {
    // Added in Pi SDK 0.85.1 for `openai` and `openai-codex` only.
    expect(getPiModelsForAuthProvider('openai').map(m => m.id)).toContain('pi/gpt-6-astra');
    expect(getPiModelsForAuthProvider('openai-codex').map(m => m.id)).toContain('pi/gpt-6-astra');
  });

  it('returns Kimi K3 from the Pi SDK catalog for both Moonshot providers', () => {
    const ids = getPiModelsForAuthProvider('moonshotai').map(m => m.id);
    expect(ids).toContain('pi/kimi-k3');
    expect(ids).toContain('pi/kimi-k2.6');

    const cnIds = getPiModelsForAuthProvider('moonshotai-cn').map(m => m.id);
    expect(cnIds).toContain('pi/kimi-k3');
  });
});
