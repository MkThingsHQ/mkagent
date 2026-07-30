/**
 * Resolves the best web search provider based on the user's LLM connection.
 *
 * Priority:
 *   1. Provider-native search (OpenAI, OpenRouter, Google) — best quality
 *   2. DuckDuckGo — universal fallback, no API key required
 *
 * To add a new Responses API-compatible provider:
 *   1. Add a case here with the provider name and apiBase URL
 *   2. The ResponsesApiSearchProvider handles the rest
 */

import type { WebSearchProvider } from './types.ts';
import { ResponsesApiSearchProvider } from './providers/openai.ts';
import { GoogleSearchProvider } from './providers/google.ts';
import { DDGSearchProvider } from './providers/ddg.ts';

export type SearchProviderCredential =
  | { type: 'api_key'; key: string }
  | { type: 'oauth'; access: string; refresh: string; expires: number };

export interface SearchProviderAuthConfig {
  provider?: string;
  credential?: SearchProviderCredential;
}

function getApiKey(piAuth?: SearchProviderAuthConfig): string | undefined {
  if (piAuth?.credential?.type !== 'api_key') return undefined;
  return typeof piAuth.credential.key === 'string' && piAuth.credential.key.length > 0
    ? piAuth.credential.key
    : undefined;
}

export function resolveSearchProvider(piAuth?: SearchProviderAuthConfig): WebSearchProvider {
  const provider = piAuth?.provider;
  const apiKey = getApiKey(piAuth);

  // OpenAI with API key → standard Responses API
  if (provider === 'openai' && apiKey) {
    return new ResponsesApiSearchProvider({
      apiBase: 'https://api.openai.com/v1',
      apiKey,
    });
  }

  // OpenRouter → same Responses API format, different base URL
  if (provider === 'openrouter' && apiKey) {
    return new ResponsesApiSearchProvider({
      apiBase: 'https://openrouter.ai/api/v1',
      apiKey,
      model: 'openai/gpt-4o-mini',
    });
  }

  // Google → Gemini API with native Google Search grounding
  if (provider === 'google' && apiKey) {
    return new GoogleSearchProvider(apiKey);
  }

  // Vercel AI Gateway is currently not wired to provider-native search routing.
  // It intentionally falls back to DDG until we add an explicit Responses API mapping.

  // Universal fallback — no API key required
  return new DDGSearchProvider();
}
