/**
 * HeaderIconButton
 *
 * Unified icon button for panel headers (Navigator and Detail panels).
 * 28×28 ghost button (spec §4 controls), secondary icon, fill on hover/open; 36×36 in compact via
 * `.header-icon-btn`. The tooltip text doubles as the accessible name unless `aria-label` is given.
 */

import * as React from 'react'
import { forwardRef } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@mkagent/ui'
import { cn } from '@/lib/utils'

interface HeaderIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon as React element - caller controls size/styling */
  icon: React.ReactNode
  /** Optional tooltip text (also used as the accessible name) */
  tooltip?: string
}

export const HeaderIconButton = forwardRef<HTMLButtonElement, HeaderIconButtonProps>(
  ({ icon, tooltip, className, ...props }, ref) => {
    const button = (
      <button
        ref={ref}
        type="button"
        aria-label={props['aria-label'] ?? tooltip}
        className={cn(
          "header-icon-btn inline-flex items-center justify-center",
          "size-control shrink-0 rounded-md titlebar-no-drag",
          "text-secondary hover:text-foreground hover:bg-fill-hover active:bg-fill-pressed",
          "data-[state=open]:text-foreground data-[state=open]:bg-fill-hover",
          "transition-[background-color,color] duration-micro ease-out-subtle hover:duration-instant",
          "disabled:pointer-events-none disabled:text-disabled",
          className
        )}
        {...props}
      >
        {icon}
      </button>
    )

    if (tooltip) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      )
    }

    return button
  }
)
HeaderIconButton.displayName = 'HeaderIconButton'
