import { useState, useLayoutEffect, type RefObject } from 'react'

/** Content-box width, like ResizeObserver's contentBoxSize.inlineSize. */
function contentWidth(el: HTMLElement): number {
  const style = getComputedStyle(el)
  return el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
}

/**
 * Tracks the inline-size (width) of a DOM element using ResizeObserver.
 *
 * Used by AppShell to derive `isAutoCompact` — when the shell container
 * is narrower than the mobile threshold, sidebar/navigator auto-collapse
 * and panels switch to single-panel mode.
 *
 * The first measurement happens in a layout effect, which re-renders before the browser paints:
 * a narrow window never paints the wide layout first and then reflows into compact (that reflow
 * was the WebUI's cold-load layout shift). Returns 0 only before the element exists.
 */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(contentWidth(el))

    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentBoxSize[0].inlineSize)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return width
}
