import { useLayoutEffect, useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react"
import { Spinner } from "@mkagent/ui"
import { useTheme } from "@/context/ThemeContext"

/** Compact layout (≤ 767px): toasts move to the top because the composer owns the bottom. */
const COMPACT_QUERY = "(max-width: 767px)"

function subscribeCompact(onChange: () => void) {
  const query = window.matchMedia(COMPACT_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

const getCompact = () => window.matchMedia(COMPACT_QUERY).matches

/** Content-card geometry published by the shell (see useToastAnchor). */
const ANCHOR_LEFT_VAR = "--toast-anchor-left"
const ANCHOR_WIDTH_VAR = "--toast-anchor-width"

/** Toast width: 356px, narrowed to fit inside the first pane with 10px to spare on each side. */
const TOAST_WIDTH = `min(356px, calc(var(${ANCHOR_WIDTH_VAR}, 376px) - 20px))`

/**
 * Publishes where the desktop content card starts (px from the window's left edge) and the width
 * of its first pane, so toasts sit inside one pane instead of over the sidebar or straddling into
 * the composer. Pass `left = null` when there is no desktop card (compact layout) and
 * `paneWidth = null` when the first pane is wide enough for a full-width toast.
 */
export function useToastAnchor(left: number | null, paneWidth: number | null = null) {
  useLayoutEffect(() => {
    if (left === null) return
    const root = document.documentElement
    root.style.setProperty(ANCHOR_LEFT_VAR, `${left}px`)
    if (paneWidth !== null) root.style.setProperty(ANCHOR_WIDTH_VAR, `${paneWidth}px`)
    return () => {
      root.style.removeProperty(ANCHOR_LEFT_VAR)
      root.style.removeProperty(ANCHOR_WIDTH_VAR)
    }
  }, [left, paneWidth])
}

/**
 * Toasts (design spec D10, §7.10): bottom-left of the content card on desktop, inside its first
 * pane — clear of the sidebar and of the composer — and top-center in compact; at most 3
 * visible; 5s by default. Status reads from the leading icon on the floating material. Materials
 * and motion live in index.css ([data-sonner-toast]).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedMode } = useTheme()
  const compact = useSyncExternalStore(subscribeCompact, getCompact, () => false)

  return (
    <Sonner
      theme={resolvedMode as ToasterProps["theme"]}
      position={compact ? "top-center" : "bottom-left"}
      // 10px inside the card's bottom-left corner (the card ends 6px above the window edge)
      offset={compact ? undefined : { left: `calc(var(${ANCHOR_LEFT_VAR}, 0px) + 10px)`, bottom: 16 }}
      swipeDirections={compact ? ["top"] : ["left"]}
      visibleToasts={3}
      duration={5000}
      closeButton
      richColors={false}
      className="toaster group"
      icons={{
        success: <CircleCheck />,
        info: <Info />,
        warning: <TriangleAlert />,
        error: <CircleAlert />,
        loading: <Spinner />,
      }}
      style={
        {
          "--normal-bg": "var(--surface-floating)",
          "--normal-text": "var(--text)",
          "--normal-border": "transparent",
          "--border-radius": "var(--radius-lg)",
          "--width": compact ? "356px" : TOAST_WIDTH,
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
