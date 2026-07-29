import type { SessionFilter } from '../../shared/types'

export interface CollapsedGroupScopeOptions {
  workspaceId?: string
  currentFilter?: SessionFilter
  groupingMode: 'date' | 'unread'
}

export function serializeSessionFilterForScope(filter?: SessionFilter): string {
  if (!filter) return 'allSessions'

  return filter.kind
}

/**
 * Build a deterministic scope suffix for collapsed group persistence.
 * This prevents collapse state from bleeding across workspaces, filters, and grouping modes.
 */
export function buildCollapsedGroupsScopeSuffix({
  workspaceId,
  currentFilter,
  groupingMode,
}: CollapsedGroupScopeOptions): string {
  const workspaceSegment = workspaceId ? encodeURIComponent(workspaceId) : 'global'
  const filterSegment = serializeSessionFilterForScope(currentFilter)
  return `ws=${workspaceSegment}|filter=${filterSegment}|group=${groupingMode}`
}
