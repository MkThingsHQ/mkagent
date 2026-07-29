import { describe, it, expect } from 'bun:test'
import {
  buildCollapsedGroupsScopeSuffix,
  serializeSessionFilterForScope,
} from '../session-list-collapse'

describe('serializeSessionFilterForScope', () => {
  it('serializes simple filter kinds', () => {
    expect(serializeSessionFilterForScope({ kind: 'allSessions' })).toBe('allSessions')
    expect(serializeSessionFilterForScope({ kind: 'flagged' })).toBe('flagged')
    expect(serializeSessionFilterForScope({ kind: 'archived' })).toBe('archived')
  })

})

describe('buildCollapsedGroupsScopeSuffix', () => {
  it('creates different keys for different filters and grouping modes', () => {
    const allSessionsDate = buildCollapsedGroupsScopeSuffix({
      workspaceId: 'ws-1',
      currentFilter: { kind: 'allSessions' },
      groupingMode: 'date',
    })

    const allSessionsUnread = buildCollapsedGroupsScopeSuffix({
      workspaceId: 'ws-1',
      currentFilter: { kind: 'allSessions' },
      groupingMode: 'unread',
    })

    const flaggedDate = buildCollapsedGroupsScopeSuffix({
      workspaceId: 'ws-1',
      currentFilter: { kind: 'flagged' },
      groupingMode: 'date',
    })

    expect(allSessionsDate).not.toBe(allSessionsUnread)
    expect(allSessionsDate).not.toBe(flaggedDate)
  })

  it('creates different keys across workspaces', () => {
    const ws1 = buildCollapsedGroupsScopeSuffix({
      workspaceId: 'workspace-one',
      currentFilter: { kind: 'allSessions' },
      groupingMode: 'date',
    })

    const ws2 = buildCollapsedGroupsScopeSuffix({
      workspaceId: 'workspace-two',
      currentFilter: { kind: 'allSessions' },
      groupingMode: 'date',
    })

    expect(ws1).not.toBe(ws2)
  })
})
