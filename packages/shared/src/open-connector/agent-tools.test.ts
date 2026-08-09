import { describe, expect, it } from 'bun:test';
import {
  executeOpenConnectorProxyTool,
  normalizeOpenConnectorToolDefinitions,
  OPEN_CONNECTOR_PROXY_PREFIX,
  OPEN_CONNECTOR_READ_ONLY_PROXY_TOOL_NAMES,
  OPEN_CONNECTOR_TOOL_NAMES,
  parseOpenConnectorProxyToolName,
  type OpenConnectorRemoteToolDefinition,
  type OpenConnectorToolBridge,
} from './agent-tools.ts';

function remoteDefinitions(): OpenConnectorRemoteToolDefinition[] {
  return OPEN_CONNECTOR_TOOL_NAMES.map(name => ({
    name,
    description: `${name} description`,
    inputSchema: { type: 'object', properties: {} },
  }));
}

describe('OpenConnector Pi proxy tools', () => {
  it('normalizes the pinned five-tool surface and namespaces every tool', () => {
    const definitions = normalizeOpenConnectorToolDefinitions(remoteDefinitions());
    expect(definitions.map(definition => definition.name)).toEqual(
      OPEN_CONNECTOR_TOOL_NAMES.map(name => `${OPEN_CONNECTOR_PROXY_PREFIX}${name}`),
    );
    expect(OPEN_CONNECTOR_READ_ONLY_PROXY_TOOL_NAMES.has(`${OPEN_CONNECTOR_PROXY_PREFIX}execute_action`)).toBe(false);
  });

  it('rejects missing or unexpected remote tools', () => {
    expect(() => normalizeOpenConnectorToolDefinitions(remoteDefinitions().slice(1))).toThrow('Missing: list_apps');
    expect(() => normalizeOpenConnectorToolDefinitions([
      ...remoteDefinitions(),
      { name: 'future_tool', inputSchema: { type: 'object' } },
    ])).toThrow('Unexpected: future_tool');
  });

  it('parses only the pinned namespace and names', () => {
    expect(parseOpenConnectorProxyToolName(`${OPEN_CONNECTOR_PROXY_PREFIX}search_actions`)).toBe('search_actions');
    expect(parseOpenConnectorProxyToolName(`${OPEN_CONNECTOR_PROXY_PREFIX}future_tool`)).toBeNull();
    expect(parseOpenConnectorProxyToolName('mcp__other__list_apps')).toBeNull();
  });

  it('dispatches the unprefixed tool name to the session bridge', async () => {
    const calls: unknown[] = [];
    const controller = new AbortController();
    const bridge: OpenConnectorToolBridge = {
      async listTools() { return remoteDefinitions(); },
      async callTool(name, args, options) {
        calls.push({ name, args, signal: options?.signal });
        return { content: 'ok', isError: false };
      },
    };

    await expect(executeOpenConnectorProxyTool(
      bridge,
      `${OPEN_CONNECTOR_PROXY_PREFIX}search_actions`,
      { query: 'issues' },
      { signal: controller.signal },
    )).resolves.toEqual({ content: 'ok', isError: false });
    expect(calls).toEqual([{
      name: 'search_actions',
      args: { query: 'issues' },
      signal: controller.signal,
    }]);
  });

  it('returns a stable error when the desktop bridge is unavailable', async () => {
    await expect(executeOpenConnectorProxyTool(
      undefined,
      `${OPEN_CONNECTOR_PROXY_PREFIX}list_apps`,
      {},
    )).resolves.toEqual({ content: 'OpenConnector is unavailable in this session.', isError: true });
  });
});
