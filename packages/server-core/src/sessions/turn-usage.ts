import type { AgentEventUsage } from '@mkagent/core/types'
import type { SessionTokenUsage } from '@mkagent/shared/sessions'

/** Pi completes with per-turn billing; input/cache describe the final API call. */
export function addTurnUsage(target: SessionTokenUsage, usage: AgentEventUsage): void {
  target.inputTokens = usage.inputTokens
  target.outputTokens += usage.outputTokens
  target.costUsd += usage.costUsd ?? 0
  target.totalTokens = target.inputTokens + target.outputTokens
  target.cacheReadTokens = usage.cacheReadTokens ?? 0
  target.cacheCreationTokens = usage.cacheCreationTokens ?? 0
  if (usage.contextWindow) target.contextWindow = usage.contextWindow
  // contextUsage is an SDK occupancy snapshot, never a billing counter.
}
