import type { ContextUsageSnapshot } from '@mkagent/core/types'
import { formatTokenCount } from './model-picker-helpers'

export interface ContextStatus {
  isCompacting?: boolean
  /** Legacy input count; an estimate of occupancy, not a compaction policy. */
  inputTokens?: number
  contextWindow?: number
  contextUsage?: ContextUsageSnapshot
}

const validCount = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const validLimit = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

/** Snapshot presence is authoritative even when its count/limit is unknown.
 * Never resurrect a pre-compaction legacy count or fabricate a policy threshold. */
export function getContextDisplay(status?: ContextStatus, modelContextWindow?: number | null) {
  const snapshot = status?.contextUsage
  const usedTokens = validCount(snapshot ? snapshot.usedTokens : status?.inputTokens)
  const limitTokens = snapshot
    ? validLimit(snapshot.limitTokens)
    : validLimit(status?.contextWindow) ?? validLimit(modelContextWindow ?? undefined)
  const isStale = snapshot?.isStale ?? false
  const percent = usedTokens !== null && limitTokens !== null
    ? Math.round(usedTokens / limitTokens * 100)
    : null
  return {
    visible: !!snapshot || usedTokens !== null,
    usedTokens,
    limitTokens,
    limitKind: snapshot?.limitKind ?? 'context',
    percent,
    isEstimate: snapshot?.isEstimate ?? true,
    isStale,
    canCompact: snapshot?.canCompact === true,
    showWarning: percent !== null && percent >= 80 && !isStale && !status?.isCompacting,
  }
}

type Translate = (key: string, options?: Record<string, string | number>) => string

/** Shared text contract keeps desktop and compact/mobile labels identical. */
export function getContextDisplayLabels(display: ReturnType<typeof getContextDisplay>, t: Translate) {
  return {
    window: t(display.limitKind === 'compaction' ? 'chat.contextUsage.compactionWindow' : 'chat.contextUsage.contextWindow'),
    usage: display.usedTokens === null
      ? t('chat.contextUsage.unknown')
      : display.limitTokens !== null
        ? t('chat.contextUsage.tokensOfLimit', { used: formatTokenCount(display.usedTokens), limit: formatTokenCount(display.limitTokens) })
        : t('chat.tokensUsed', { displayCount: formatTokenCount(display.usedTokens) }),
    percent: display.percent !== null ? t('chat.contextUsage.percentUsed', { percent: display.percent }) : '',
    qualifier: [display.isEstimate && t('chat.contextUsage.estimated'), display.isStale && t('chat.contextUsage.stale')].filter(Boolean).join(' · '),
  }
}
