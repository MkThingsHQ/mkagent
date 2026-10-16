import * as React from "react"
import { cn } from "@/lib/utils"

interface TurnFrameProps {
  /** Stable key of the turn (also the key used by transcript search) */
  turnKey: string
  /** Registers the frame element for search scrolling/highlighting */
  registerRef: (turnKey: string, element: HTMLDivElement | null) => void
  /** This turn holds the current search match */
  isCurrentMatch: boolean
  /** This turn holds any search match */
  isAnyMatch: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Wrapper of one transcript turn: registers it for in-session search and draws the search
 * match ring (info role; the current match solid, others faint). The ring sits 8px outside the
 * turn, in the column gutter, so it frames the text instead of touching it (like row fills, it
 * bleeds past the text edge). It fades in and out on box-shadow only (100ms).
 */
export function TurnFrame({ turnKey, registerRef, isCurrentMatch, isAnyMatch, className, children }: TurnFrameProps) {
  const ref = React.useCallback(
    (element: HTMLDivElement | null) => registerRef(turnKey, element),
    [registerRef, turnKey]
  )
  return (
    <div
      ref={ref}
      className={cn(
        "min-w-0 rounded-lg transition-[box-shadow] duration-micro ease-out-subtle",
        isCurrentMatch && "ring-2 ring-info ring-offset-8 ring-offset-paper",
        isAnyMatch && !isCurrentMatch && "ring-1 ring-info/30 ring-offset-8 ring-offset-paper",
        className
      )}
    >
      {children}
    </div>
  )
}
