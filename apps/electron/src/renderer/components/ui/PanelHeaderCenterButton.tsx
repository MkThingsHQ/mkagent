import * as React from 'react'
import { forwardRef } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@mkagent/ui'
import { cn } from '@/lib/utils'

interface PanelHeaderCenterButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon as React element - caller controls size/styling */
  icon: React.ReactNode
  /** Optional tooltip text (also used as the accessible name) */
  tooltip?: string
}

/**
 * Icon button for panel-header actions (share, info, close, back): a 28×28 ghost button with a
 * secondary icon (spec §7.3). In the compact shell `.panel-header-btn` grows it to a 44px touch target.
 */
export const PanelHeaderCenterButton = forwardRef<HTMLButtonElement, PanelHeaderCenterButtonProps>(
  ({ icon, tooltip, className, ...props }, ref) => {
    const button = (
      <button
        ref={ref}
        type="button"
        aria-label={props['aria-label'] ?? tooltip}
        className={cn(
          "panel-header-btn inline-flex items-center justify-center",
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
PanelHeaderCenterButton.displayName = 'PanelHeaderCenterButton'
