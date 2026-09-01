/** Named Pi provider and custom endpoint configurations. */

import type { ModelDefinition } from './models.ts';

type PiModelResolver = (piAuthProvider?: string) => ModelDefinition[];
let piModelResolver: PiModelResolver = () => [];

export function registerPiModelResolver(resolver: PiModelResolver): void {
  piModelResolver = resolver;
}

export type LlmProviderType = 'pi' | 'pi_compat';
export type LlmAuthType = 'api_key' | 'api_key_with_endpoint' | 'oauth' | 'none';
export type ModelSelectionMode = 'automaticallySyncedFromProvider' | 'userDefined3Tier';
export type CustomEndpointApi = 'openai-completions' | 'anthropic-messages';
export type MidStreamBehavior = 'steer' | 'queue';

export interface CustomEndpointConfig {
  api: CustomEndpointApi;
  supportsImages?: boolean;
}

export interface LlmConnection {
  slug: string;
  name: string;
  providerType: LlmProviderType;
  baseUrl?: string;
  authType: LlmAuthType;
  models?: Array<ModelDefinition | string>;
  defaultModel?: string;
  modelSelectionMode?: ModelSelectionMode;
  piAuthProvider?: string;
  customEndpoint?: CustomEndpointConfig;
  midStreamBehavior?: MidStreamBehavior;
  oauthAccountUuid?: string;
  oauthAccountEmail?: string;
  oauthOrganizationUuid?: string;
  oauthOrganizationName?: string;
  oauthProfileVerifiedAt?: number;
  createdAt: number;
  lastUsedAt?: number;
}

export interface LlmConnectionWithStatus extends LlmConnection {
  isAuthenticated: boolean;
  authError?: string;
  isDefault?: boolean;
}

/**
 * Returns true when `modelId` must not be used as the mini/summarization model.
 * `codex-mini-latest` is always denied. ChatGPT subscription auth also rejects
 * every `*codex-mini*` variant, while regular OpenAI API keys remain unaffected.
 */
export function isDeniedMiniModelId(modelId: string, piAuthProvider?: string): boolean {
  const bare = modelId.startsWith('pi/') ? modelId.slice(3) : modelId;
  if (piAuthProvider === 'openai-codex' && bare.includes('codex-mini')) return true;
  return bare === 'codex-mini-latest';
}

function findSmallModel(
  connection: Pick<LlmConnection, 'models' | 'piAuthProvider'>,
): string | undefined {
  if (!connection.models?.length) return undefined;
  const idOf = (model: ModelDefinition | string): string =>
    typeof model === 'string' ? model : model.id;
  const searchText = (model: ModelDefinition | string): string =>
    typeof model === 'string'
      ? model.toLowerCase()
      : `${model.id} ${model.name} ${model.shortName}`.toLowerCase();
  const allowed = connection.models.filter(model => !isDeniedMiniModelId(idOf(model), connection.piAuthProvider));
  const preferred = allowed.find(model =>
    ['mini', 'haiku', 'flash'].some(keyword => searchText(model).includes(keyword))
  );
  const fallback = preferred ?? allowed.at(-1) ?? connection.models.at(-1);
  return fallback ? idOf(fallback) : undefined;
}

export function getMiniModel(
  connection: Pick<LlmConnection, 'models' | 'providerType' | 'piAuthProvider'>,
): string | undefined {
  return findSmallModel(connection);
}

export function getSummarizationModel(
  connection: Pick<LlmConnection, 'models' | 'providerType' | 'piAuthProvider'>,
): string | undefined {
  return findSmallModel(connection);
}

export function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug);
}

export function getLlmCredentialKey(slug: string): string {
  return `llm::${slug}::api_key`;
}

export type LlmCredentialStorageType = 'api_key' | 'oauth' | null;

export function authTypeToCredentialStorageType(authType: LlmAuthType): LlmCredentialStorageType {
  if (authType === 'none') return null;
  return authType === 'oauth' ? 'oauth' : 'api_key';
}

export function authTypeToCredentialType(authType: LlmAuthType): 'api_key' | 'oauth_token' | null {
  if (authType === 'oauth') return 'oauth_token';
  return authType === 'none' ? null : 'api_key';
}

export function authTypeRequiresEndpoint(authType: LlmAuthType): boolean {
  return authType === 'api_key_with_endpoint';
}

export function isCompatProvider(providerType: LlmProviderType): boolean {
  return providerType === 'pi_compat';
}

export function isLocalConnection(connection: Pick<LlmConnection, 'baseUrl'>): boolean {
  if (!connection.baseUrl?.trim()) return false;
  try {
    const hostname = new URL(connection.baseUrl.trim()).hostname.replace(/^\[|\]$/g, '');
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

export function isPiProvider(providerType: LlmProviderType): boolean {
  return providerType === 'pi' || providerType === 'pi_compat';
}

export function defaultMidStreamBehavior(_providerType: LlmProviderType): MidStreamBehavior {
  return 'steer';
}

export function resolveMidStreamBehavior(
  connection: Pick<LlmConnection, 'midStreamBehavior' | 'providerType'>,
): MidStreamBehavior {
  return connection.midStreamBehavior === 'queue' || connection.midStreamBehavior === 'steer'
    ? connection.midStreamBehavior
    : defaultMidStreamBehavior(connection.providerType);
}

export function setModelSupportsImages(
  connection: LlmConnection,
  modelId: string,
  enabled: boolean,
): LlmConnection {
  if (!connection.models) return connection;
  const index = connection.models.findIndex(model =>
    (typeof model === 'string' ? model : model.id) === modelId
  );
  if (index < 0) return connection;
  const current = connection.models[index]!;
  const next = typeof current === 'string'
    ? ({ id: current, name: current, shortName: current, supportsImages: enabled } as ModelDefinition)
    : { ...current, supportsImages: enabled };
  const models = [...connection.models];
  models[index] = next;
  return { ...connection, models };
}

export function modelSupportsImages(
  connection: Pick<LlmConnection, 'providerType' | 'models' | 'customEndpoint'>,
  modelId: string,
): boolean {
  if (!isCompatProvider(connection.providerType)) return true;
  const model = connection.models?.find(candidate =>
    (typeof candidate === 'string' ? candidate : candidate.id) === modelId
  );
  if (model && typeof model !== 'string' && typeof model.supportsImages === 'boolean') {
    return model.supportsImages;
  }
  return connection.customEndpoint?.supportsImages ?? false;
}

export function getModelsForProviderType(
  providerType: LlmProviderType,
  piAuthProvider?: string,
): ModelDefinition[] {
  return providerType === 'pi' ? piModelResolver(piAuthProvider) : [];
}

export const PI_PREFERRED_DEFAULTS: Record<string, string[]> = {
  anthropic: [
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-5',
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
  ],
  'openai-codex': ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.2', 'gpt-5.1'],
  openai: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.2', 'gpt-5.1'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview'],
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  moonshotai: ['kimi-k3', 'kimi-k2.6'],
  'moonshotai-cn': ['kimi-k3', 'kimi-k2.6'],
  'kimi-coding': ['k3', 'kimi-for-coding', 'kimi-for-coding-highspeed'],
};

export function getDefaultModelsForConnection(
  providerType: LlmProviderType,
  piAuthProvider?: string,
): Array<ModelDefinition | string> {
  if (providerType === 'pi_compat') return [];
  const models = [...piModelResolver(piAuthProvider)];
  const preferred = piAuthProvider ? PI_PREFERRED_DEFAULTS[piAuthProvider] ?? [] : [];
  const priority = (id: string): number => {
    const bare = id.startsWith('pi/') ? id.slice(3) : id;
    const index = preferred.findIndex(value => bare === value || bare.startsWith(`${value}-`));
    return index < 0 ? preferred.length : index;
  };
  return models.sort((a, b) => priority(a.id) - priority(b.id));
}

export function getDefaultModelForConnection(
  providerType: LlmProviderType,
  piAuthProvider?: string,
): string {
  const first = getDefaultModelsForConnection(providerType, piAuthProvider)[0];
  return typeof first === 'string' ? first : first?.id ?? '';
}

export function resolveEffectiveConnectionSlug(
  sessionConnection: string | undefined,
  workspaceDefault: string | undefined,
  connections: Pick<LlmConnectionWithStatus, 'slug' | 'isDefault'>[],
): string | undefined {
  return sessionConnection
    ?? workspaceDefault
    ?? connections.find(connection => connection.isDefault)?.slug
    ?? connections[0]?.slug;
}

export function isSessionConnectionUnavailable(
  sessionConnection: string | undefined,
  connections: Pick<LlmConnectionWithStatus, 'slug'>[],
): boolean {
  return Boolean(sessionConnection && !connections.some(connection => connection.slug === sessionConnection));
}

export function isValidProviderAuthCombination(
  providerType: LlmProviderType,
  authType: LlmAuthType,
): boolean {
  return providerType === 'pi'
    ? authType === 'api_key' || authType === 'oauth'
    : authType === 'api_key_with_endpoint' || authType === 'none';
}
