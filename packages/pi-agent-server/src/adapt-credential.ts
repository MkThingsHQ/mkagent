/**
 * Adapts MkAgent wire credentials to shapes the Pi SDK credential resolver accepts.
 *
 * Pi SDK >=0.81 resolves stored credentials strictly by type. A stored credential
 * owns its provider, so ambient resolution is consulted only when nothing is
 * stored. MkAgent's main process owns OAuth refresh and sends ChatGPT bearer
 * tokens to this subprocess; those tokens must be represented as OAuth credentials
 * for the SDK resolver.
 */

import { builtinProviders } from '@earendil-works/pi-ai/providers/all';
import type { Credential as PiSdkCredential } from '@earendil-works/pi-ai';

export type PiCredential =
  | { type: 'api_key'; key: string }
  | { type: 'oauth'; access: string; refresh: string; expires: number }
  | { type: 'iam'; accessKeyId: string; secretAccessKey: string; region?: string; sessionToken?: string };

let oauthOnlyProviderIdsCache: Set<string> | null = null;

function oauthOnlyProviderIds(): Set<string> {
  if (!oauthOnlyProviderIdsCache) {
    oauthOnlyProviderIdsCache = new Set(
      builtinProviders()
        .filter((provider) => provider.auth.oauth && !provider.auth.apiKey)
        .map((provider) => provider.id),
    );
  }
  return oauthOnlyProviderIdsCache;
}

/**
 * Returns the credential to store, or null when the provider must resolve from
 * ambient environment variables. The far-future OAuth expiry keeps Pi's refresh
 * path unreachable because MkAgent refreshes tokens in the main process and
 * reinjects them through token_update.
 */
export function adaptCredentialForPiSdk(
  provider: string,
  credential: PiCredential,
): PiSdkCredential | null {
  if (credential.type === 'api_key' && oauthOnlyProviderIds().has(provider)) {
    return {
      type: 'oauth',
      access: credential.key,
      refresh: '',
      expires: Number.MAX_SAFE_INTEGER,
    };
  }
  if (credential.type === 'iam') return null;
  return credential as unknown as PiSdkCredential;
}
