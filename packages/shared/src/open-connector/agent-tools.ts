export const OPEN_CONNECTOR_PROXY_PREFIX = 'mcp__open_connector__';

export const OPEN_CONNECTOR_TOOL_NAMES = [
  'list_apps',
  'list_connections',
  'search_actions',
  'get_action_guide',
  'execute_action',
] as const;

export type OpenConnectorToolName = (typeof OPEN_CONNECTOR_TOOL_NAMES)[number];

export interface OpenConnectorRemoteToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface OpenConnectorProxyToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface OpenConnectorToolExecutionResult {
  content: string;
  isError: boolean;
}

export interface OpenConnectorToolBridge {
  listTools(options?: { signal?: AbortSignal }): Promise<OpenConnectorRemoteToolDefinition[]>;
  callTool(
    name: OpenConnectorToolName,
    args: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<OpenConnectorToolExecutionResult>;
}

const OPEN_CONNECTOR_TOOL_NAME_SET = new Set<string>(OPEN_CONNECTOR_TOOL_NAMES);

export const OPEN_CONNECTOR_READ_ONLY_PROXY_TOOL_NAMES = new Set<string>([
  `${OPEN_CONNECTOR_PROXY_PREFIX}list_apps`,
  `${OPEN_CONNECTOR_PROXY_PREFIX}list_connections`,
  `${OPEN_CONNECTOR_PROXY_PREFIX}search_actions`,
  `${OPEN_CONNECTOR_PROXY_PREFIX}get_action_guide`,
]);

export function toOpenConnectorProxyToolName(name: OpenConnectorToolName): string {
  return `${OPEN_CONNECTOR_PROXY_PREFIX}${name}`;
}

export function parseOpenConnectorProxyToolName(name: string): OpenConnectorToolName | null {
  if (!name.startsWith(OPEN_CONNECTOR_PROXY_PREFIX)) return null;
  const toolName = name.slice(OPEN_CONNECTOR_PROXY_PREFIX.length);
  return OPEN_CONNECTOR_TOOL_NAME_SET.has(toolName) ? toolName as OpenConnectorToolName : null;
}

export function normalizeOpenConnectorToolDefinitions(
  remoteDefinitions: OpenConnectorRemoteToolDefinition[],
): OpenConnectorProxyToolDefinition[] {
  const remoteNames = new Set(remoteDefinitions.map(definition => definition.name));
  const missing = OPEN_CONNECTOR_TOOL_NAMES.filter(name => !remoteNames.has(name));
  const unexpected = [...remoteNames].filter(name => !OPEN_CONNECTOR_TOOL_NAME_SET.has(name));
  if (missing.length > 0 || unexpected.length > 0 || remoteDefinitions.length !== OPEN_CONNECTOR_TOOL_NAMES.length) {
    throw new Error([
      'OpenConnector MCP tool surface does not match the pinned integration.',
      missing.length > 0 ? `Missing: ${missing.join(', ')}` : '',
      unexpected.length > 0 ? `Unexpected: ${unexpected.join(', ')}` : '',
    ].filter(Boolean).join(' '));
  }

  const byName = new Map(remoteDefinitions.map(definition => [definition.name, definition]));
  return OPEN_CONNECTOR_TOOL_NAMES.map(name => {
    const definition = byName.get(name);
    if (!definition || !definition.inputSchema || typeof definition.inputSchema !== 'object' || Array.isArray(definition.inputSchema)) {
      throw new Error(`OpenConnector MCP tool has an invalid input schema: ${name}`);
    }
    return {
      name: toOpenConnectorProxyToolName(name),
      description: definition.description?.trim() || `OpenConnector ${name} tool.`,
      inputSchema: structuredClone(definition.inputSchema),
    };
  });
}

export async function executeOpenConnectorProxyTool(
  bridge: OpenConnectorToolBridge | undefined,
  proxyName: string,
  args: Record<string, unknown>,
  options?: { signal?: AbortSignal },
): Promise<OpenConnectorToolExecutionResult> {
  const toolName = parseOpenConnectorProxyToolName(proxyName);
  if (!toolName) return { content: `Unknown OpenConnector tool: ${proxyName}`, isError: true };
  if (!bridge) return { content: 'OpenConnector is unavailable in this session.', isError: true };
  return bridge.callTool(toolName, args, options);
}
