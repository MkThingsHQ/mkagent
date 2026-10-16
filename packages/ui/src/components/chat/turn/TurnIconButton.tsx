import * as React from 'react'
import { cn } from '../../../lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip'

/**
 * Small icon-only button for transcript chrome (answer footer, work log, code wells).
 *
 * Mirrors the electron `IconButton size="sm"` primitive (24px, radius-sm, secondary icon,
 * instant hover-in / 100ms hover-out, press scale via `motion-press`), which packages/ui can't
 * import. `data-slot="icon-button"` picks up the compact shell's 36px touch target from the
 * electron stylesheet. The accessible name is required by the type.
 */
export const TURN_ICON_BUTTON =
  "motion-press inline-grid size-control-sm flex-none place-items-center rounded-sm text-secondary hover:bg-fill-hover hover:text-foreground active:bg-fill-pressed aria-expanded:bg-fill-hover aria-expanded:text-foreground data-[state=open]:bg-fill-hover data-[state=open]:text-foreground disabled:pointer-events-none disabled:text-disabled [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5"

export interface TurnIconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Accessible name — required: icon-only controls must be named (WCAG 4.1.2). */
  'aria-label': string
  /** The icon (14px unless it sets its own size-*) */
  icon: React.ReactNode
  /** Tooltip: `true` repeats the aria-label, or pass custom content. */
  tooltip?: React.ReactNode | true
}

export const TurnIconButton = React.forwardRef<HTMLButtonElement, TurnIconButtonProps>(
  ({ className, icon, tooltip, type = 'button', ...props }, ref) => {
    const button = (
      <button
        ref={ref}
        type={type}
        data-slot="icon-button"
        className={cn(TURN_ICON_BUTTON, className)}
        {...props}
      >
        {icon}
      </button>
    )
    if (!tooltip) return button
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip === true ? props['aria-label'] : tooltip}</TooltipContent>
      </Tooltip>
    )
  }
)
TurnIconButton.displayName = 'TurnIconButton'
