import { describe, expect, it } from 'bun:test';
import { resolveSearchProvider } from './resolve-provider.ts';
import { ResponsesApiSearchProvider } from './providers/openai.ts';
import { GoogleSearchProvider } from './providers/google.ts';
import { DDGSearchProvider } from './providers/ddg.ts';

describe('resolveSearchProvider', () => {
  it('selects ResponsesApiSearchProvider for OpenAI API keys', () => {
    const provider = resolveSearchProvider({
      provider: 'openai',
      credential: { type: 'api_key', key: 'sk-test' },
    });
    expect(provider).toBeInstanceOf(ResponsesApiSearchProvider);
    expect(provider.name).toBe('OpenAI');
  });

  it('selects ResponsesApiSearchProvider for OpenRouter API keys', () => {
    const provider = resolveSearchProvider({
      provider: 'openrouter',
      credential: { type: 'api_key', key: 'sk-or-test' },
    });
    expect(provider).toBeInstanceOf(ResponsesApiSearchProvider);
    expect(provider.name).toBe('OpenRouter');
  });

  it('selects Google search for Google API keys', () => {
    expect(resolveSearchProvider({
      provider: 'google',
      credential: { type: 'api_key', key: 'g-test' },
    })).toBeInstanceOf(GoogleSearchProvider);
  });

  it('falls back to DuckDuckGo for unknown providers', () => {
    expect(resolveSearchProvider({
      provider: 'unknown',
      credential: { type: 'api_key', key: 'x' },
    })).toBeInstanceOf(DDGSearchProvider);
  });

  it('falls back to DuckDuckGo for empty or absent credentials', () => {
    expect(resolveSearchProvider({
      provider: 'openai',
      credential: { type: 'api_key', key: '' },
    })).toBeInstanceOf(DDGSearchProvider);
    expect(resolveSearchProvider()).toBeInstanceOf(DDGSearchProvider);
  });
});
