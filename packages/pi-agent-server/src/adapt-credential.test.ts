import { describe, expect, it } from 'bun:test';
import { InMemoryCredentialStore, InMemoryModelsStore } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { adaptCredentialForPiSdk } from './adapt-credential.ts';

/** Runtime backed by a store holding the adapted credential (null adaptations store nothing). */
async function runtimeWithAdaptedCredential(
  provider: string,
  credential: Parameters<typeof adaptCredentialForPiSdk>[1],
): Promise<ModelRuntime> {
  const credentials = new InMemoryCredentialStore();
  const adapted = adaptCredentialForPiSdk(provider, credential);
  if (adapted) {
    await credentials.modify(provider, async () => adapted);
  }
  return ModelRuntime.create({ credentials, modelsPath: null, modelsStore: new InMemoryModelsStore() });
}

/**
 * These tests run against the real Pi SDK provider catalog on purpose: they pin
 * the auth-handler contract the adaptation depends on. If an SDK bump changes
 * which providers are OAuth-only, a failure here says the adaptation rules (not
 * the SDK) need a second look.
 */
describe('adaptCredentialForPiSdk', () => {
  it('rewraps a ChatGPT Plus bearer token as an oauth credential for openai-codex (OAuth-only provider)', () => {
    const adapted = adaptCredentialForPiSdk('openai-codex', { type: 'api_key', key: 'chatgpt-jwt' });
    expect(adapted).toEqual({
      type: 'oauth',
      access: 'chatgpt-jwt',
      refresh: '',
      expires: Number.MAX_SAFE_INTEGER,
    });
  });

  it('keeps the rewrapped expiry ahead of the SDK refresh check so pi never self-refreshes', () => {
    const adapted = adaptCredentialForPiSdk('openai-codex', { type: 'api_key', key: 'chatgpt-jwt' });
    // resolveStoredOAuth refreshes when Date.now() >= expires; the main process
    // owns refresh (token_update), so this must never trigger.
    expect(adapted.type).toBe('oauth');
    if (adapted.type === 'oauth') {
      expect(Date.now()).toBeLessThan(adapted.expires);
    }
  });

  it('passes anthropic api_key credentials through unchanged (Claude Max bearer resolves via envApiKeyAuth)', () => {
    const credential = { type: 'api_key' as const, key: 'sk-ant-oat-token' };
    expect(adaptCredentialForPiSdk('anthropic', credential)).toEqual(credential);
  });

  it('passes plain API key credentials through for providers with an apiKey handler', () => {
    const credential = { type: 'api_key' as const, key: 'sk-real-api-key' };
    expect(adaptCredentialForPiSdk('openai', credential)).toEqual(credential);
    expect(adaptCredentialForPiSdk('moonshotai', credential)).toEqual(credential);
  });

  it('passes canonical OAuth credentials through unchanged', () => {
    const credential = {
      type: 'oauth' as const,
      access: 'oauth-access-token',
      refresh: 'oauth-refresh-token',
      expires: 1234567890,
    };
    expect(adaptCredentialForPiSdk('anthropic', credential)).toEqual(credential);
  });

  it('returns null for iam credentials so bedrock resolves ambiently from AWS env vars', () => {
    // A stored credential shadows ambient resolution in pi SDK ≥0.81, and 'iam'
    // matches no SDK handler — storing it makes the provider unconfigured.
    const credential = {
      type: 'iam' as const,
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
      region: 'eu-west-1',
    };
    expect(adaptCredentialForPiSdk('amazon-bedrock', credential)).toBeNull();
  });

  it('passes api_key through for unknown providers (custom endpoints are not in the builtin catalog)', () => {
    const credential = { type: 'api_key' as const, key: 'whatever' };
    expect(adaptCredentialForPiSdk('custom-endpoint', credential)).toEqual(credential);
  });
});

/**
 * End-to-end resolution through the real SDK runtime — the exact checks the
 * agent-session prompt preflight and request-auth paths perform. These are the
 * assertions that would have caught the 0.81.1 breakage before release.
 */
describe('adapted credentials resolve through ModelRuntime', () => {
  it('openai-codex: adapted bearer token authenticates and models become available', async () => {
    const runtime = await runtimeWithAdaptedCredential('openai-codex', { type: 'api_key', key: 'chatgpt-jwt' });
    const auth = await runtime.getAuth('openai-codex');
    expect(auth?.auth.apiKey).toBe('chatgpt-jwt');
    expect(runtime.hasConfiguredAuth('openai-codex')).toBe(true);
    expect(runtime.isUsingOAuth('openai-codex')).toBe(true);
    expect(runtime.getAvailableSnapshot().some(m => m.provider === 'openai-codex')).toBe(true);
  });

  it('amazon-bedrock: iam credential is not stored, so ambient AWS env vars keep resolving', async () => {
    const priorAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const priorSecret = process.env.AWS_SECRET_ACCESS_KEY;
    process.env.AWS_ACCESS_KEY_ID = 'AKIA_TEST';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    try {
      const runtime = await runtimeWithAdaptedCredential('amazon-bedrock', {
        type: 'iam',
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'test-secret',
        region: 'eu-west-1',
      });
      // Storing the iam credential verbatim flips both of these to false/empty
      // (a stored credential shadows ambient resolution in pi SDK ≥0.81).
      expect(runtime.hasConfiguredAuth('amazon-bedrock')).toBe(true);
      expect(runtime.getAvailableSnapshot().some(m => m.provider === 'amazon-bedrock')).toBe(true);
    } finally {
      if (priorAccessKey === undefined) delete process.env.AWS_ACCESS_KEY_ID;
      else process.env.AWS_ACCESS_KEY_ID = priorAccessKey;
      if (priorSecret === undefined) delete process.env.AWS_SECRET_ACCESS_KEY;
      else process.env.AWS_SECRET_ACCESS_KEY = priorSecret;
    }
  });
});
