import { getViewportRect, subscribeViewportChanges } from '@/lib/input-viewport'

/** Keep the app shell inside the top-level visible browser viewport, including
 * keyboard panning. Only the host is sized; shared components own their layout.
 * No scroll resets: they fight Safari's focus handling and accessibility zoom. */
export function installViewportRoot(root: HTMLElement): () => void {
  let frame: number | undefined
  const properties = ['--webui-viewport-top', '--webui-viewport-left', '--webui-viewport-width', '--webui-viewport-height', '--webui-css-zoom']
  const previous = properties.map(name => root.style.getPropertyValue(name))
  const update = () => {
    frame = undefined
    const viewport = getViewportRect()
    const values = [
      `${viewport.top / viewport.cssZoom}px`,
      `${viewport.left / viewport.cssZoom}px`,
      `${viewport.width / viewport.cssZoom}px`,
      `${viewport.height / viewport.cssZoom}px`,
      `${viewport.cssZoom}`,
    ]
    properties.forEach((name, index) => {
      if (root.style.getPropertyValue(name) !== values[index]) root.style.setProperty(name, values[index]!)
    })
  }
  const schedule = () => {
    if (frame === undefined) frame = window.requestAnimationFrame(update)
  }
  update()
  const unsubscribe = subscribeViewportChanges(window, schedule)
  return () => {
    unsubscribe()
    if (frame !== undefined) window.cancelAnimationFrame(frame)
    properties.forEach((name, index) => {
      if (previous[index]) root.style.setProperty(name, previous[index]!)
      else root.style.removeProperty(name)
    })
  }
}
