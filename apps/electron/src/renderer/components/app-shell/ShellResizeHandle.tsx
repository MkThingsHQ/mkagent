/**
 * ShellResizeHandle — the drag handle on a seam of the shell (sidebar | list, list | content).
 * A transparent hit area with a hairline gradient that follows the pointer (useResizeGradient).
 * Presentational: AppShell owns the widths and the drag loop. Seams move with the layout at once —
 * they are not animated (spec §6.1: no `left` animation).
 */

import * as React from "react"
import { getResizeGradientStyle } from "@/hooks/useResizeGradient"
import {
  PANEL_SASH_HIT_WIDTH,
  PANEL_SASH_LINE_WIDTH,
  PANEL_STACK_VERTICAL_OVERFLOW,
} from "./panel-constants"

interface ShellResizeHandleProps {
  handleRef: React.RefObject<HTMLDivElement>
  /** Left edge of the hit area, in px from the shell's left edge */
  left: number
  /** Pointer Y inside the handle while hovered/dragged (drives the gradient), null when idle */
  hoverY: number | null
  onHoverYChange: (y: number | null) => void
  /** Keep the gradient when the pointer leaves (it is mid-drag) */
  keepHoverOnLeave: boolean
  onDragStart: () => void
}

export function ShellResizeHandle({
  handleRef,
  left,
  hoverY,
  onHoverYChange,
  keepHoverOnLeave,
  onDragStart,
}: ShellResizeHandleProps) {
  return (
    <div
      ref={handleRef}
      onMouseDown={(e) => { e.preventDefault(); onDragStart() }}
      onMouseMove={(e) => {
        if (handleRef.current) {
          const rect = handleRef.current.getBoundingClientRect()
          onHoverYChange(e.clientY - rect.top)
        }
      }}
      onMouseLeave={() => { if (!keepHoverOnLeave) onHoverYChange(null) }}
      className="absolute cursor-col-resize z-panel flex justify-center"
      style={{
        width: PANEL_SASH_HIT_WIDTH,
        top: PANEL_STACK_VERTICAL_OVERFLOW,
        bottom: PANEL_STACK_VERTICAL_OVERFLOW,
        left,
      }}
    >
      <div
        className="h-full"
        style={{
          ...getResizeGradientStyle(hoverY, handleRef.current?.clientHeight ?? null),
          width: PANEL_SASH_LINE_WIDTH,
        }}
      />
    </div>
  )
}
