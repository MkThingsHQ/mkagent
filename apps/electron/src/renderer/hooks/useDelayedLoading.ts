import { useEffect, useRef, useState } from 'react'

export interface DelayedLoadingOptions {
  /** Show nothing for loads shorter than this (ms). */
  delayMs?: number
  /** Once shown, keep the placeholder at least this long (ms) so it never blinks. */
  minVisibleMs?: number
}

/**
 * Whether to show a loading placeholder (Skeleton) for `isLoading`: only after `delayMs`
 * (default 200ms), and then for at least `minVisibleMs` (default 400ms). Fast loads render
 * the content directly; slow ones get a steady placeholder instead of a flash.
 */
export function useDelayedLoading(
  isLoading: boolean,
  { delayMs = 200, minVisibleMs = 400 }: DelayedLoadingOptions = {},
): boolean {
  const [visible, setVisible] = useState(false)
  const shownAt = useRef<number | null>(null)

  useEffect(() => {
    if (isLoading) {
      if (visible) return
      const timer = setTimeout(() => {
        shownAt.current = Date.now()
        setVisible(true)
      }, delayMs)
      return () => clearTimeout(timer)
    }
    if (!visible) return
    const remaining = minVisibleMs - (Date.now() - (shownAt.current ?? 0))
    if (remaining <= 0) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(false), remaining)
    return () => clearTimeout(timer)
  }, [isLoading, visible, delayMs, minVisibleMs])

  return visible
}
