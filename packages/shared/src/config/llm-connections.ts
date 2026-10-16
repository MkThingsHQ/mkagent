/** Named Pi provider and custom endpoint configurations. */

import { normalizeDeprecatedModelId, type ModelDefinition } from './models.ts';

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

export const PI_PREFERRED_MINI_MODELS: Record<string, string[]> = {
  openai: ['gpt-6-luna', 'gpt-5.6-luna', 'gpt-5.4-nano', 'gpt-5.4-mini'],
  'openai-codex': ['gpt-6-luna', 'gpt-5.6-luna'],
  anthropic: ['claude-haiku-5-5', 'claude-haiku-4-5'],
  'amazon-bedrock': ['claude-haiku-5-5', 'claude-haiku-4-5'],
  moonshotai: ['kimi-k2.6'],
  'moonshotai-cn': ['kimi-k2.6'],
  'cloudflare-ai-gateway': ['claude-haiku-4-5', 'gpt-6-luna', 'gpt-5.6-luna'],
};

/**
 * Index of a model id in a preferred list (bare ids, `pi/` optional, `{id}-*`
 * snapshots and Bedrock inference profiles match their bare id), or -1.
 */
export function preferredModelRank(id: string, preferred: readonly string[]): number {
  const bare = id.startsWith('pi/') ? id.slice(3) : id
  // Deprecated IDs normalize to their replacement for stored-config migration.
  // Rank them as unranked: fromBedrockNativeId() applies the same normalization,
  // and letting a retired snapshot (e.g. claude-opus-4-5-20251101) inherit its
  // replacement's rank made the stable sort pick it as the connection default.
  if (normalizeDeprecatedModelId(bare) !== bare) return -1
  const matchIndex = (candidate: string): number =>
    preferred.findIndex(p => candidate === p || candidate.startsWith(`${p}-`))
  const direct = matchIndex(bare)
  if (direct >= 0) return direct
  // Bedrock: reverse-map the native inference-profile ID to bare, then match
  const reversed = bare.replace(/^(?:(?:[a-z]{2}|global)\.)?anthropic\./, '')
  return reversed !== bare ? matchIndex(reversed) : -1
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
  const preferredIds = connection.piAuthProvider ? PI_PREFERRED_MINI_MODELS[connection.piAuthProvider] ?? [] : [];
  const ranked = allowed.map(model => ({ model, rank: preferredModelRank(idOf(model), preferredIds) }))
    .filter(item => item.rank >= 0).sort((a, b) => a.rank - b.rank);
  const preferred = ranked[0]?.model ?? allowed.find(model =>
    ['mini', 'luna', 'haiku', 'flash'].some(keyword => new RegExp(`(^|[^a-z])${keyword}([^a-z]|$)`).test(searchText(model)))
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
  // TODO(opus-4.6-sunset): drop 'claude-opus-4-6' from anthropic and amazon-bedrock
  // when Opus 4.6 is deprecated.
  // Opus 5.5 (in the Pi catalog since SDK 0.87.1) is the default for new
  // connections, matching the Claude Agent SDK path; older Opus generations follow.
  anthropic: ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-fable-5-1', 'claude-fable-5', 'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-5-5', 'claude-haiku-4-5'],
  // GPT-6 Astra entered the Pi catalog in SDK 0.85.1 for both the API-key and
  // the ChatGPT-account (openai-codex) flows; new connections default to it.
  openai: ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'o4-mini', 'o3', 'gpt-4o'],
  'openai-codex': ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'o4-mini', 'o3', 'gpt-4o'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'],
  // Pi 0.86.0 replaced the retired `deepseek-v4-flash` alias (and the experimental
  // vision variant) with `deepseek-flash`; stored ids migrate via DEPRECATED_MODEL_REPLACEMENTS.
  deepseek: ['deepseek-v4-pro', 'deepseek-flash'],
  // K2.6 is also the utility model (PI_PREFERRED_MINI_MODELS).
  moonshotai: ['kimi-k3', 'kimi-k2.6'],
  'moonshotai-cn': ['kimi-k3', 'kimi-k2.6'],
  'kimi-coding': ['k3', 'kimi-for-coding', 'kimi-for-coding-highspeed'],
  'cloudflare-ai-gateway': ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'gpt-6-astra', 'gpt-6.1-sol', 'claude-haiku-4-5'],
  'amazon-bedrock': ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-5-5', 'claude-haiku-4-5'],
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
    // Retired snapshots must not inherit their replacement's priority and
    // become a new connection's default.
    if (normalizeDeprecatedModelId(bare) !== bare) return preferred.length;
    const preferredId = bare.replace(/^(?:(?:[a-z]{2}|global)\.)?anthropic\./, '');
    const index = preferred.findIndex(value => preferredId === value || preferredId.startsWith(`${value}-`));
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
