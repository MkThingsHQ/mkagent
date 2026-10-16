import * as React from 'react'
import { INSERT_DROP, revealDelay } from './turn-classes'

export interface RowRevealProps {
  className?: string
  style?: React.CSSProperties
}

/**
 * Insert-animation props for the rows of a list that mounts when it is revealed (expand) and
 * may grow while streaming (spec §6.3 "Expand in place"): rows present when the list mounted
 * fade in with a 25ms stagger capped at 6, rows added later just drop in once. Pass
 * `enabled=false` on the card's first render so a session switch or reload shows rows as is.
 *
 * The animation itself is CSS (@starting-style), so it only ever runs when a row element is
 * created — re-renders and streamed tokens never re-trigger it.
 */
export function useRowReveal(rowCount: number, enabled: boolean): (index: number) => RowRevealProps | undefined {
  const revealCount = React.useRef<number | null>(null)
  if (revealCount.current === null) revealCount.current = rowCount

  return React.useCallback(
    (index: number) => {
      if (!enabled) return undefined
      return {
        className: INSERT_DROP,
        style: index < (revealCount.current ?? 0) ? revealDelay(index) : undefined,
      }
    },
    [enabled]
  )
}
