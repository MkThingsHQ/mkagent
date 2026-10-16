import * as React from "react"

/**
 * Scrolls to target element on mount, before browser paint.
 * Uses useLayoutEffect to ensure scroll happens before content is visible.
 */
export function ScrollOnMount({
  targetRef,
  onScroll,
  skip = false
}: {
  targetRef: React.RefObject<HTMLDivElement | null>
  onScroll?: () => void
  skip?: boolean
}) {
  React.useLayoutEffect(() => {
    if (skip) return
    targetRef.current?.scrollIntoView({ behavior: 'instant' })
    onScroll?.()
  }, [skip])
  return null
}
