import type { ContextUsageSnapshot } from '@mkagent/core/types';

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.ceil(value)
    : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Normalize both public SDK shapes: query control response and result.context_usage. */
export function contextFromClaude(value: unknown): ContextUsageSnapshot | undefined {
  const raw = record(value);
  if (!raw) return undefined;
  const usedTokens = tokenCount(raw.totalTokens ?? raw.total_tokens);
  if (usedTokens === undefined) return undefined;
  const limit = tokenCount(raw.rawMaxTokens ?? raw.raw_max_tokens ?? raw.maxTokens);
  const hardLimit = raw.isAutoCompactEnabled === false || record(raw.over_limit)?.kind === 'hard_limit';
  return {
    usedTokens,
    ...(limit && { limitTokens: limit }),
    limitKind: hardLimit ? 'context' : 'compaction',
    // The SDK's summary path explicitly combines usage with local estimates.
    isEstimate: true,
    isStale: false,
    canCompact: true,
  };
}

/** A compaction boundary invalidates the old count even when no new estimate is supplied. */
export function contextAfterCompaction(
  postTokens: unknown,
  previous?: ContextUsageSnapshot,
): ContextUsageSnapshot {
  const count = tokenCount(postTokens);
  return {
    ...(previous?.limitTokens && { limitTokens: previous.limitTokens }),
    usedTokens: count ?? null,
    limitKind: previous?.limitKind ?? 'compaction',
    isEstimate: true,
    isStale: count === undefined,
    canCompact: previous?.canCompact ?? true,
  };
}

/** Pass the SDK's own snapshot/settings; do not duplicate its default reserve in the host/UI. */
export function contextFromPi(
  value: { tokens: number | null; contextWindow: number } | undefined,
  settings?: { enabled: boolean; reserveTokens: number },
  postCompactionEstimate?: number,
): ContextUsageSnapshot | undefined {
  if (!value) return undefined;
  const usedTokens = tokenCount(postCompactionEstimate) ?? tokenCount(value.tokens);
  const window = tokenCount(value.contextWindow);
  const reserve = settings?.enabled ? tokenCount(settings.reserveTokens) : undefined;
  const limit = window !== undefined && reserve !== undefined ? window - reserve : window;
  return {
    usedTokens: usedTokens ?? null,
    ...(limit !== undefined && limit > 0 && { limitTokens: limit }),
    limitKind: reserve !== undefined ? 'compaction' : 'context',
    isEstimate: true,
    isStale: usedTokens === undefined,
    canCompact: true,
  };
}
