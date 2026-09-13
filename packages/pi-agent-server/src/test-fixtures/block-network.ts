/**
 * Preloaded by bundle-smoke.test.ts so the auth-path assertion can never make
 * a real provider request. The fake OAuth token should fail at accountId
 * extraction before fetch; reaching either guard is therefore a test failure.
 */
function blockedNetworkTarget(input: string | URL | Request): never {
  const target = typeof input === 'string' || input instanceof URL
    ? String(input)
    : input.url;
  throw new Error(`OFFLINE_FETCH_BLOCKED: unexpected network request to ${target}`);
}

const blockedFetch = Object.assign(
  async (input: string | URL | Request): Promise<Response> => blockedNetworkTarget(input),
  {
    preconnect: (url: string | URL): void => blockedNetworkTarget(url),
  },
) satisfies typeof globalThis.fetch;

globalThis.fetch = blockedFetch;
