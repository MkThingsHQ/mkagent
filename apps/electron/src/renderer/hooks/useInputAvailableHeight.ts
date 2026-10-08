import * as React from 'react'
import { getInputAvailableHeight, getViewportRect, measureInputAvailableHeight, subscribeViewportChanges } from '@/lib/input-viewport'

/** Measure against a stable chat panel (or an explicit host/playground bound).
 * Observe the input zone too: badges may grow without a window resize. Measuring
 * only its space OUTSIDE the input keeps composer growth out of its own budget. */
export function useInputAvailableHeight(ref: React.RefObject<HTMLElement>, enabled = true): number {
  const [height, setHeight] = React.useState(() => getInputAvailableHeight(getViewportRect()))

  React.useLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const element = ref.current
    if (!element) return
    const parent = element.parentElement
    const bounds = element.closest<HTMLElement>('[data-focus-zone="chat"], [data-composer-bounds], #root')
    let frame: number | undefined
    const measure = () => {
      frame = undefined
      const next = measureInputAvailableHeight(element)
      setHeight(previous => previous === next ? previous : next)
    }
    const schedule = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(measure)
    }
    measure()
    const unsubscribe = subscribeViewportChanges(window, schedule)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule)
    if (bounds) observer?.observe(bounds)
    if (parent && parent !== bounds) observer?.observe(parent)
    return () => {
      unsubscribe()
      observer?.disconnect()
      if (frame !== undefined) window.cancelAnimationFrame(frame)
    }
  }, [ref, enabled])

  return height
}
