import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "../lib/utils"

/**
 * Tooltip timing (design spec §5): 500ms before the first tooltip, then instant for the next
 * 300ms so moving across a toolbar doesn't flash or wait. Mount once near the app root.
 */
function TooltipProvider({
  delayDuration = 500,
  skipDelayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      disableHoverableContent
      {...props}
    />
  )
}

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

/** Floating material; fades + scales in after the delay, instantly inside the skip window. */
function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "motion-tooltip z-tooltip inline-flex max-w-xs items-center gap-2 overflow-hidden rounded-md px-2 py-1 wrap-anywhere",
          "bg-floating text-label-sm text-foreground shadow-elev-2",
          "origin-(--radix-tooltip-content-transform-origin)",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
