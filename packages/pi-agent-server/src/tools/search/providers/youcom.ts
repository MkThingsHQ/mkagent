/**
 * You.com search provider — MCP streamable HTTP, keyless by default.
 *
 * Speaks the You.com MCP server's JSON-RPC protocol over plain fetch:
 *   1. initialize (captures the session id when the server issues one)
 *   2. notifications/initialized
 *   3. tools/call you-search
 *
 * Without an API key the keyless free profile endpoint is used (you-search
 * only); with an API key the authenticated endpoint is used instead. Any
 * failure throws, so createSearchTool falls back to DuckDuckGo.
 */

import type { WebSearchProvider, WebSearchResult } from '../types.ts';

const FREE_PROFILE_URL = 'https://api.you.com/mcp?profile=free';
const AUTHENTICATED_URL = 'https://api.you.com/mcp';
const MCP_PROTOCOL_VERSION = '2025-06-18';

export interface YouComSearchProviderOptions {
  /** You.com API key. When set, the authenticated endpoint is used instead of the keyless free profile. */
  apiKey?: string;
}

interface McpContentBlock {
  type?: string;
  text?: string;
}

interface McpToolCallResult {
  content?: McpContentBlock[];
  isError?: boolean;
}

interface McpJsonRpcResponse {
  result?: unknown;
  error?: { message?: string };
}

interface McpHttpResponse {
  parsed?: McpJsonRpcResponse;
  sessionId?: string;
}

interface YouComWebResult {
  url?: string;
  title?: string;
  description?: string;
  contents?: { highlights?: string[] };
}

/**
 * Extract the JSON-RPC response from an MCP streamable HTTP body. The server
 * answers with `text/event-stream` and may send notification events before
 * the response event, but plain `application/json` responses are also legal.
 */
function parseMcpResponse(contentType: string, body: string): McpJsonRpcResponse {
  const candidates: string[] = [];

  if (contentType.includes('text/event-stream')) {
    let data: string[] = [];
    for (const line of body.split(/\r?\n/)) {
      if (line.startsWith('data:')) {
        data.push(line.slice(5).trimStart());
      } else if (data.length > 0 && line.trim() === '') {
        candidates.push(data.join('\n'));
        data = [];
      }
    }
    if (data.length > 0) candidates.push(data.join('\n'));
  } else {
    candidates.push(body);
  }

  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    // Responses carry a result or error; server notifications carry a method.
    if (
      parsed &&
      typeof parsed === 'object' &&
      ('result' in parsed || 'error' in parsed) &&
      !('method' in parsed)
    ) {
      return parsed as McpJsonRpcResponse;
    }
  }

  throw new Error('You.com MCP response contained no JSON-RPC result');
}

async function postJsonRpc(
  url: string,
  authHeaders: Record<string, string>,
  payload: unknown,
  sessionId: string | undefined,
  timeoutMs: number,
): Promise<McpHttpResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      ...authHeaders,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `You.com MCP returned HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 200)}` : ''}`,
    );
  }

  const responseSessionId = response.headers.get('mcp-session-id') ?? undefined;
  const body = await response.text();
  if (!body.trim()) return { sessionId: responseSessionId };

  return {
    sessionId: responseSessionId,
    parsed: parseMcpResponse(response.headers.get('content-type') ?? '', body),
  };
}

export class YouComSearchProvider implements WebSearchProvider {
  name = 'You.com';

  private readonly url: string;
  private readonly apiKey?: string;

  constructor(options: YouComSearchProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim() || undefined;
    this.url = this.apiKey ? AUTHENTICATED_URL : FREE_PROFILE_URL;
  }

  async search(query: string, count: number): Promise<WebSearchResult[]> {
    const authHeaders: Record<string, string> = this.apiKey
      ? { Authorization: `Bearer ${this.apiKey}` }
      : {};

    const init = await postJsonRpc(
      this.url,
      authHeaders,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'mkagent', version: '0.1.2' },
        },
      },
      undefined,
      15_000,
    );
    if (init.parsed?.error) {
      throw new Error(
        `You.com search failed to initialize: ${init.parsed.error.message ?? 'unknown error'}`,
      );
    }

    // No response body is expected for the initialized notification (202).
    await postJsonRpc(
      this.url,
      authHeaders,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      init.sessionId,
      15_000,
    );

    const call = await postJsonRpc(
      this.url,
      authHeaders,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'you-search', arguments: { query, count } },
      },
      init.sessionId,
      30_000,
    );

    if (call.parsed?.error) {
      throw new Error(`You.com search failed: ${call.parsed.error.message ?? 'unknown error'}`);
    }

    const toolResult = call.parsed?.result as McpToolCallResult | undefined;
    if (toolResult?.isError) {
      const errorText = toolResult.content?.find((c) => c.type === 'text')?.text ?? '';
      throw new Error(
        `You.com search failed for "${query}": ${errorText.slice(0, 200) || 'unknown error'}`,
      );
    }

    const textBlock = toolResult?.content?.find((c) => c.type === 'text' && c.text);
    if (!textBlock?.text) {
      throw new Error(`You.com search returned no results for "${query}"`);
    }

    let payload: { results?: { web?: YouComWebResult[] } };
    try {
      payload = JSON.parse(textBlock.text);
    } catch {
      throw new Error(`You.com search returned malformed results for "${query}"`);
    }

    const web = payload.results?.web ?? [];
    if (web.length === 0) {
      throw new Error(`No You.com results for "${query}"`);
    }

    return web.slice(0, count).map((r) => ({
      title: r.title || r.url || '',
      url: r.url || '',
      description: r.description || r.contents?.highlights?.[0] || '',
    }));
  }
}