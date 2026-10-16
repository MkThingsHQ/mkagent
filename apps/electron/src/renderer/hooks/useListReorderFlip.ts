import * as React from 'react'
import type { FlipTarget } from '@mkagent/ui/motion'

export interface ListReorderFlipOptions {
  /** Attribute holding each row's stable id (rows that change group are new elements). */
  rowKeyAttribute: string
  /** Row ids in display order, grouped: one entry per group (its key) followed by that group's rows. */
  groups: ReadonlyArray<{ key: string; ids: readonly string[] }>
  /** Element containing the rows. */
  container: React.RefObject<HTMLElement | null>
  /** The list's scroll viewport: only rows inside it are measured and animated. */
  viewport: React.RefObject<HTMLElement | null>
}

/**
 * Props for <FlipOnChange> that glide rows to their new place when a list reorders itself — a session
 * gets new activity and moves up, or into another group (design spec §7.2). Only a pure reorder
 * animates: when rows are added, removed, filtered, searched or paged in, the list changes instantly.
 * Only rows inside the scroll viewport move; reduced motion is handled by playFlip.
 */
export function useListReorderFlip({ groups, container, viewport, rowKeyAttribute }: ListReorderFlipOptions) {
  const rowSelector = `[${rowKeyAttribute}]`
  const value = React.useMemo(
    () => groups.map((group) => `${group.key}:${group.ids.join(',')}`).join('|'),
    [groups],
  )
  const rowSet = React.useMemo(
    () => groups.flatMap((group) => group.ids).sort().join(','),
    [groups],
  )
  const previousRowSet = React.useRef(rowSet)
  const enabled = previousRowSet.current === rowSet
  React.useEffect(() => {
    previousRowSet.current = rowSet
  })

  const getTargets = React.useCallback((): FlipTarget[] => {
    const root = container.current
    const scroller = viewport.current
    if (!root || !scroller) return []
    const bounds = scroller.getBoundingClientRect()
    return Array.from(root.querySelectorAll<HTMLElement>(rowSelector))
      .filter((el) => {
        const rect = el.getBoundingClientRect()
        return rect.bottom > bounds.top && rect.top < bounds.bottom
      })
      .map((el) => ({ el }))
  }, [container, viewport, rowSelector])

  const keyOf = React.useCallback((el: HTMLElement) => el.getAttribute(rowKeyAttribute), [rowKeyAttribute])

  return { value, enabled, getTargets, keyOf }
}
