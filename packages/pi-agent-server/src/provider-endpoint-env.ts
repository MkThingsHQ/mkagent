import { CLOUDFLARE_AI_GATEWAY_PROVIDER, parseCloudflareGatewayUrl } from '../../shared/src/config/cloudflare-gateway.ts';

/**
 * Environment the Pi SDK reads a tenant-specific endpoint from, derived from the
 * connection's base URL (Pi provider ids, after `toPiProviderId`):
 *
 * - `azure`: AZURE_OPENAI_BASE_URL.
 * - `cloudflare-ai-gateway`: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_GATEWAY_ID, which the
 *   SDK substitutes into every gateway model URL.
 *
 * Empty for other providers or an unusable URL.
 */
export function providerEndpointEnv(provider: string | undefined, baseUrl: string | undefined): Record<string, string> {
  const url = baseUrl?.trim();
  if (!provider || !url) return {};
  if (provider === 'azure') return { AZURE_OPENAI_BASE_URL: url };
  if (provider === CLOUDFLARE_AI_GATEWAY_PROVIDER) {
    const ids = parseCloudflareGatewayUrl(url);
    return ids ? { CLOUDFLARE_ACCOUNT_ID: ids.accountId, CLOUDFLARE_GATEWAY_ID: ids.gatewayId } : {};
  }
  return {};
}
