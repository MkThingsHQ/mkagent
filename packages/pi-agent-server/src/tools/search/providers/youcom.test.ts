import { afterEach, describe, expect, it } from 'bun:test';
import { YouComSearchProvider } from './youcom.ts';
import { resolveSearchProvider } from '../resolve-provider.ts';
import { DDGSearchProvider } from './ddg.ts';
import { ResponsesApiSearchProvider } from './openai.ts';

const originalFetch = globalThis.fetch;
const originalSearchProviderEnv = process.env.MKAGENT_SEARCH_PROVIDER;
const originalApiKeyEnv = process.env.YDC_API_KEY;

interface RecordedCall {
  url: string;
  headers: Record<string, string>;
  body: any;
}

function sseBody(events: object[]): string {
  return events.map((e) => `event: message\ndata: ${JSON.stringify(e)}\n`).join('\n');
}

function youSearchText(web: object[]): string {
  return JSON.stringify({ results: { web } });
}

/**
 * Installs a fetch mock that answers the three-step MCP streamable HTTP
 * handshake (initialize → notifications/initialized → tools/call) and
 * records every request for assertions.
 */
function installMcpMock(options: {
  initResponse?: Response;
  searchResponse?: Response;
  initHeaders?: Record<string, string>;
  calls: RecordedCall[];
}): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    options.calls.push({ url, headers, body });

    if (body?.method === 'initialize') {
      return (
        options.initResponse ??
        new Response(
          sseBody([
            {
              result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'You.com', version: '4.0.2' } },
              jsonrpc: '2.0',
              id: 1,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'text/event-stream', ...options.initHeaders } },
        )
      );
    }

    if (body?.method === 'notifications/initialized') {
      return new Response('', { status: 202 });
    }

    return (
      options.searchResponse ??
      new Response(
        sseBody([
          { jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', data: 'Search successful' } },
          {
            result: {
              content: [{ type: 'text', text: youSearchText([
                { url: 'https://example.com/a', title: 'A', description: 'First result' },
                { url: 'https://example.com/b', title: 'B', contents: { highlights: ['Highlight only'] } },
              ]) }],
            },
            jsonrpc: '2.0',
            id: 2,
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )
    );
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalSearchProviderEnv === undefined) delete process.env.MKAGENT_SEARCH_PROVIDER;
  else process.env.MKAGENT_SEARCH_PROVIDER = originalSearchProviderEnv;
  if (originalApiKeyEnv === undefined) delete process.env.YDC_API_KEY;
  else process.env.YDC_API_KEY = originalApiKeyEnv;
});

describe('YouComSearchProvider', () => {
  it('runs the keyless handshake against the free profile and maps results', async () => {
    const calls: RecordedCall[] = [];
    installMcpMock({ calls });

    const provider = new YouComSearchProvider();
    const results = await provider.search('mkagent docs', 5);

    expect(provider.name).toBe('You.com');
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.url === 'https://api.you.com/mcp?profile=free')).toBe(true);
    expect(calls.every((c) => c.headers.Authorization === undefined)).toBe(true);

    expect(calls[0].body.method).toBe('initialize');
    expect(calls[1].body.method).toBe('notifications/initialized');
    expect(calls[2].body.method).toBe('tools/call');
    expect(calls[2].body.params.name).toBe('you-search');
    expect(calls[2].body.params.arguments).toEqual({ query: 'mkagent docs', count: 5 });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: 'A',
      url: 'https://example.com/a',
      description: 'First result',
    });
    // Missing description falls back to the first highlight.
    expect(results[1]).toEqual({
      title: 'B',
      url: 'https://example.com/b',
      description: 'Highlight only',
    });
  });

  it('uses the authenticated endpoint and Bearer header when an API key is set', async () => {
    const calls: RecordedCall[] = [];
    installMcpMock({ calls });

    const provider = new YouComSearchProvider({ apiKey: 'ydc-test-key' });
    await provider.search('test', 2);

    expect(calls.every((c) => c.url === 'https://api.you.com/mcp')).toBe(true);
    expect(calls.every((c) => c.headers.Authorization === 'Bearer ydc-test-key')).toBe(true);
  });

  it('forwards the session id issued by the server', async () => {
    const calls: RecordedCall[] = [];
    installMcpMock({ calls, initHeaders: { 'mcp-session-id': 'sess-123' } });

    const provider = new YouComSearchProvider();
    await provider.search('session', 3);

    expect(calls[0].headers['mcp-session-id']).toBeUndefined();
    expect(calls[1].headers['mcp-session-id']).toBe('sess-123');
    expect(calls[2].headers['mcp-session-id']).toBe('sess-123');
  });

  it('slices results down to count', async () => {
    const calls: RecordedCall[] = [];
    installMcpMock({
      calls,
      searchResponse: new Response(
        sseBody([
          {
            result: {
              content: [
                {
                  type: 'text',
                  text: youSearchText([
                    { url: 'https://example.com/1', title: '1', description: 'd1' },
                    { url: 'https://example.com/2', title: '2', description: 'd2' },
                    { url: 'https://example.com/3', title: '3', description: 'd3' },
                    { url: 'https://example.com/4', title: '4', description: 'd4' },
                  ]),
                },
              ],
            },
            jsonrpc: '2.0',
            id: 2,
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    });

    const provider = new YouComSearchProvider();
    const results = await provider.search('slice', 3);

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.url)).toEqual([
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3',
    ]);
  });

  it('parses plain application/json responses', async () => {
    const calls: RecordedCall[] = [];
    installMcpMock({
      calls,
      searchResponse: new Response(
        JSON.stringify({
          result: {
            content: [
              { type: 'text', text: youSearchText([{ url: 'https://example.com/json', title: 'JSON', description: 'Plain JSON' }]) },
            ],
          },
          jsonrpc: '2.0',
          id: 2,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    });

    const provider = new YouComSearchProvider();
    const results = await provider.search('json', 5);

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/json');
  });

  it('throws with the HTTP status on transport errors', async () => {
    const calls: RecordedCall[] = [];
    installMcpMock({
      calls,
      searchResponse: new Response('upstream error', { status: 502, headers: { 'Content-Type': 'text/plain' } }),
    });

    const provider = new YouComSearchProvider();
    await expect(provider.search('boom', 5)).rejects.toThrow('You.com MCP returned HTTP 502');
  });

  it('throws a JSON-RPC error message when the server rejects the call', async () => {
    const calls: RecordedCall[] = [];
    installMcpMock({
      calls,
      searchResponse: new Response(
        sseBody([{ error: { message: 'you-search is unavailable' }, jsonrpc: '2.0', id: 2 }]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    });

    const provider = new YouComSearchProvider();
    await expect(provider.search('rejected', 5)).rejects.toThrow(
      'You.com search failed: you-search is unavailable',
    );
  });

  it('throws when the tool reports isError, so the tool falls back to DuckDuckGo', async () => {
    const calls: RecordedCall[] = [];
    installMcpMock({
      calls,
      searchResponse: new Response(
        sseBody([
          {
            result: { isError: true, content: [{ type: 'text', text: 'rate limited' }] },
            jsonrpc: '2.0',
            id: 2,
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    });

    const provider = new YouComSearchProvider();
    await expect(provider.search('limited', 5)).rejects.toThrow(
      'You.com search failed for "limited": rate limited',
    );
  });

  it('throws when no web results are returned, so the tool falls back to DuckDuckGo', async () => {
    const calls: RecordedCall[] = [];
    installMcpMock({
      calls,
      searchResponse: new Response(
        sseBody([
          { result: { content: [{ type: 'text', text: youSearchText([]) }] }, jsonrpc: '2.0', id: 2 },
        ]),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    });

    const provider = new YouComSearchProvider();
    await expect(provider.search('nothing', 5)).rejects.toThrow('No You.com results for "nothing"');
  });
});

describe('resolveSearchProvider youcom opt-in', () => {
  it('selects the You.com provider when MKAGENT_SEARCH_PROVIDER=youcom', () => {
    process.env.MKAGENT_SEARCH_PROVIDER = 'YouCom';

    const provider = resolveSearchProvider(undefined, undefined);

    expect(provider).toBeInstanceOf(YouComSearchProvider);
    expect(provider.name).toBe('You.com');
  });

  it('overrides the provider-native search chosen from the LLM connection', () => {
    process.env.MKAGENT_SEARCH_PROVIDER = 'youcom';

    const provider = resolveSearchProvider({
      provider: 'openai',
      credential: { type: 'api_key', key: 'sk-test' },
    });

    expect(provider).toBeInstanceOf(YouComSearchProvider);
  });

  it('passes YDC_API_KEY through to the authenticated endpoint', async () => {
    process.env.MKAGENT_SEARCH_PROVIDER = 'youcom';
    process.env.YDC_API_KEY = 'ydc-resolver-key';

    const provider = resolveSearchProvider(undefined, undefined);
    expect(provider).toBeInstanceOf(YouComSearchProvider);

    const calls: RecordedCall[] = [];
    installMcpMock({ calls });
    await provider.search('via resolver', 4);

    expect(calls.every((c) => c.url === 'https://api.you.com/mcp')).toBe(true);
    expect(calls.every((c) => c.headers.Authorization === 'Bearer ydc-resolver-key')).toBe(true);
  });

  it('ignores unknown MKAGENT_SEARCH_PROVIDER values', () => {
    process.env.MKAGENT_SEARCH_PROVIDER = 'brave';

    const provider = resolveSearchProvider(undefined, undefined);

    expect(provider).toBeInstanceOf(DDGSearchProvider);
  });

  it('leaves the existing resolution unchanged without the env var', () => {
    delete process.env.MKAGENT_SEARCH_PROVIDER;

    const openai = resolveSearchProvider({
      provider: 'openai',
      credential: { type: 'api_key', key: 'sk-test' },
    });
    expect(openai).toBeInstanceOf(ResponsesApiSearchProvider);

    const fallback = resolveSearchProvider(undefined, undefined);
    expect(fallback).toBeInstanceOf(DDGSearchProvider);
  });
});