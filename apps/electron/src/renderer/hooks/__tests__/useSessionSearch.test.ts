import { describe, it, expect } from 'bun:test'
import { computeCollapsedPagination } from '../useSessionSearch'
import type { SessionMeta } from '@/atoms/sessions'

function makeSession(id: string, opts: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id,
    workspaceId: 'ws-1',
    lastMessageAt: Date.parse('2026-03-05T10:00:00.000Z'),
    ...opts,
  }
}

describe('computeCollapsedPagination', () => {
  it('does not hide items when current view has only one group and that group is collapsed', () => {
    const sessions = [
      makeSession('s1'),
      makeSession('s2'),
    ]

    const result = computeCollapsedPagination(
      sessions,
      50,
      new Set(['2026-03-05T00:00:00.000Z']),
      'date'
    )

    expect(result.paginatedItems.map(s => s.id)).toEqual(['s1', 's2'])
    expect(result.collapsedGroupsMeta).toEqual([])
    expect(result.hasMore).toBe(false)
  })

  it('still collapses normally when multiple groups exist', () => {
    const sessions = [
      makeSession('today', { lastMessageAt: Date.parse('2026-03-06T10:00:00.000Z') }),
      makeSession('yesterday', { lastMessageAt: Date.parse('2026-03-05T10:00:00.000Z') }),
      makeSession('older', { lastMessageAt: Date.parse('2026-03-04T10:00:00.000Z') }),
    ]

    const result = computeCollapsedPagination(
      sessions,
      50,
      new Set(['2026-03-05T00:00:00.000Z']),
      'date'
    )

    expect(result.paginatedItems.map(s => s.id)).toEqual(['today', 'older'])
    expect(result.collapsedGroupsMeta).toEqual([{ key: '2026-03-05T00:00:00.000Z', count: 1 }])
    expect(result.hasMore).toBe(false)
  })

  it('ignores collapsed keys that are not present in current view', () => {
    const sessions = [
      makeSession('a', { hasUnread: true }),
      makeSession('b', { hasUnread: false }),
    ]

    const result = computeCollapsedPagination(
      sessions,
      50,
      new Set(['unread-missing']),
      'unread'
    )

    expect(result.paginatedItems.map(s => s.id)).toEqual(['a', 'b'])
    expect(result.collapsedGroupsMeta).toEqual([])
  })

  describe('per-group windows (#501)', () => {
    const at = (iso: string) => Date.parse(iso)
    // Newest first, as the list hands them over: three recent Done, two old open sessions.
    const sessions = [
      makeSession('done1', { lastMessageAt: at('2026-03-10T10:00:00.000Z') }),
      makeSession('done2', { lastMessageAt: at('2026-03-09T10:00:00.000Z') }),
      makeSession('done3', { lastMessageAt: at('2026-03-08T10:00:00.000Z') }),
      makeSession('open1', { lastMessageAt: at('2026-02-01T10:00:00.000Z') }),
      makeSession('open2', { lastMessageAt: at('2026-01-15T10:00:00.000Z') }),
    ]



    it('unread grouping windows each group', () => {
      const unread = sessions.map((s, i) => ({ ...s, hasUnread: i >= 3 }))
      const result = computeCollapsedPagination(unread, 1, undefined, 'unread')

      expect(result.paginatedItems.map(s => s.id)).toEqual(['done1', 'open1'])
      expect(result.hasMore).toBe(true)
    })



    it('date grouping keeps one global window', () => {
      const result = computeCollapsedPagination(sessions, 2, undefined, 'date')

      expect(result.paginatedItems.map(s => s.id)).toEqual(['done1', 'done2'])
      expect(result.hasMore).toBe(true)
    })
  })
})

describe('unread pagination with collapse state', () => {
  it('counts collapsed read sessions without consuming the unread window', () => {
    const sessions = [makeSession('new-read'), makeSession('old-unread', { hasUnread: true }), makeSession('older-unread', { hasUnread: true })]
    const result = computeCollapsedPagination(sessions, 1, new Set(['unread-no']), 'unread')
    expect(result.paginatedItems.map(s => s.id)).toEqual(['old-unread'])
    expect(result.collapsedGroupsMeta).toEqual([{ key: 'unread-no', count: 1 }])
    expect(result.hasMore).toBe(true)
    expect(computeCollapsedPagination(sessions, 2, undefined, 'unread').hasMore).toBe(false)
  })
})
