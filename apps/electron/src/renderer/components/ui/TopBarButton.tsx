import * as React from "react"
import { cn } from "@/lib/utils"

interface TopBarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** The icon or content to display inside the button */
  children: React.ReactNode
  /** Whether the button is in an active/pressed state (e.g., dropdown open) */
  isActive?: boolean
  /** Additional class names */
  className?: string
}

/**
 * TopBarButton - Icon button for the app's top bar (design spec §7.1: recessive chrome).
 *
 * 28×28 (36×36 in compact via `.header-icon-btn`), secondary icon color, fill on hover/open.
 * Used for: sidebar toggle, back/forward navigation, add-panel and help menus.
 * Callers must pass an `aria-label` (icon-only).
 */
export const TopBarButton = React.forwardRef<HTMLButtonElement, TopBarButtonProps>(
  ({ children, isActive, className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={cn(
          "header-icon-btn size-control shrink-0 inline-flex items-center justify-center rounded-md titlebar-no-drag",
          "text-secondary hover:bg-fill-hover hover:text-foreground active:bg-fill-pressed",
          "data-[state=open]:bg-fill-hover data-[state=open]:text-foreground",
          "transition-[background-color,color] duration-micro ease-out-subtle hover:duration-instant",
          "disabled:text-disabled disabled:pointer-events-none",
          "[&_svg:not([class*='size-'])]:size-4",
          isActive && "bg-fill-hover text-foreground",
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

TopBarButton.displayName = "TopBarButton"
