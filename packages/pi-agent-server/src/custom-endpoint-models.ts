export type CustomEndpointInput = 'text' | 'image'

/** Custom endpoint protocol — determines which streaming adapter Pi SDK uses. */
export type CustomEndpointApi = 'openai-completions' | 'anthropic-messages'

/**
 * Output-token cap for custom endpoint models when the connection doesn't set
 * `customEndpoint.maxTokens`. We can't query an arbitrary endpoint for its real
 * limit, so the default stays conservative.
 */
export const DEFAULT_CUSTOM_ENDPOINT_MAX_TOKENS = 8_192

/** Connection-level custom endpoint config (`LlmConnection.customEndpoint`) as sent by the main process. */
export interface CustomEndpointConfig {
  api: CustomEndpointApi
  supportsImages?: boolean
  maxTokens?: number
}

export interface CustomEndpointModelDefaults {
  supportsImages?: boolean
  maxTokens?: number
}

export interface CustomEndpointModelOverrides {
  contextWindow?: number
  supportsImages?: boolean
}

export interface CustomEndpointModelEntry extends CustomEndpointModelOverrides {
  id: string
}

export type CustomEndpointModelConfig = string | {
  id: string
  contextWindow?: number
  supportsImages?: boolean
}

/** Strip bare model IDs (remove pi/ prefix if present). */
export function stripPiPrefix(id: string): string {
  return id.startsWith('pi/') ? id.slice(3) : id
}

/**
 * Normalize a user-configured custom endpoint model for Pi SDK registration.
 *
 * Keep explicit per-model capability overrides intact. In particular,
 * `supportsImages: false` is meaningful because it can override a global
 * endpoint default of `supportsImages: true` for text-only models.
 */
export function normalizeCustomEndpointModelEntry(model: CustomEndpointModelConfig): CustomEndpointModelEntry {
  if (typeof model === 'string') {
    return { id: stripPiPrefix(model) }
  }

  return {
    id: stripPiPrefix(model.id),
    ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
    ...(model.supportsImages !== undefined ? { supportsImages: model.supportsImages } : {}),
  }
}

function resolveMaxTokens(configured: number | undefined): number {
  return configured !== undefined && Number.isSafeInteger(configured) && configured > 0
    ? configured : DEFAULT_CUSTOM_ENDPOINT_MAX_TOKENS
}

/**
 * Build a synthetic model definition for a custom endpoint.
 * Uses reasonable defaults for context window and max tokens since we can't
 * query the endpoint for its actual capabilities. Image support must be
 * explicitly enabled either at the connection level or per-model.
 */
export function buildCustomEndpointModelDef(
  id: string,
  defaults?: CustomEndpointModelDefaults,
  overrides?: CustomEndpointModelOverrides,
  api?: CustomEndpointApi,
) {
  const supportsImages = overrides?.supportsImages ?? defaults?.supportsImages ?? false
  const input: CustomEndpointInput[] = supportsImages ? ['text', 'image'] : ['text']

  return {
    id,
    name: id,
    reasoning: false,
    input,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: overrides?.contextWindow ?? 131_072,
    maxTokens: resolveMaxTokens(defaults?.maxTokens),
    ...(api === 'openai-completions' ? { compat: { supportsStore: false } } : {}),
  }
}
