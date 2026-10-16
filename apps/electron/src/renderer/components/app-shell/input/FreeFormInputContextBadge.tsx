import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@mkagent/ui'
import { cn } from '@/lib/utils'
import { COMPOSER_CHIP } from './composer-styles'

export interface FreeFormInputContextBadgeProps {
  /** Left area - fully customizable (icon, avatar stack, etc.) */
  icon: React.ReactNode
  /** Label text - shown in expanded state or collapsed with selection */
  label: string
  /** Whether to show expanded state (icon + label + chevron) vs collapsed */
  isExpanded?: boolean
  /** Whether there's an active selection (affects collapsed state styling and shows label) */
  hasSelection?: boolean
  /** Show chevron indicator (for dropdowns) - only visible in expanded state */
  showChevron?: boolean
  /** Click handler */
  onClick?: () => void
  /** Tooltip content - can be string or ReactNode for rich content */
  tooltip?: React.ReactNode
  /** Whether the badge is currently "open" (e.g., dropdown is shown) */
  isOpen?: boolean
  /** Whether the badge is disabled */
  disabled?: boolean
  /** Additional className for the button */
  className?: string
  /** Ref forwarding for positioning dropdowns */
  buttonRef?: React.RefObject<HTMLButtonElement>
  /** Data attribute for tutorials */
  'data-tutorial'?: string
}

/**
 * FreeFormInputContextBadge - Unified context chip for Sources and Folder selectors
 * (mockup `.cx-bar .chip-btn`): a ghost 28px pill, secondary label, tertiary icon.
 *
 * Visual States:
 * - Expanded: Icon + Label + Chevron (placeholder label in tertiary when nothing is selected)
 * - Collapsed (no selection): Icon only, a 28px round target
 * - Collapsed (has selection): Icon + Label (ellipsized on overflow)
 * - Open: fill-hover (like hover)
 *
 * The label carries `data-badge-label` so a compact toolbar can hide it (icon-only) with CSS.
 */
export const FreeFormInputContextBadge = React.forwardRef<HTMLButtonElement, FreeFormInputContextBadgeProps>(
  function FreeFormInputContextBadge(
    {
      icon,
      label,
      isExpanded = false,
      hasSelection = false,
      showChevron = false,
      onClick,
      tooltip,
      isOpen = false,
      disabled = false,
      className,
      buttonRef,
      'data-tutorial': dataTutorial,
    },
    ref
  ) {
    // Merge refs if both are provided
    const mergedRef = buttonRef || ref

    // Show label in expanded state OR in collapsed state with selection
    const showLabel = isExpanded || hasSelection

    const button = (
      <button
        ref={mergedRef as React.Ref<HTMLButtonElement>}
        type="button"
        aria-label={label}
        aria-expanded={isOpen || undefined}
        onClick={onClick}
        disabled={disabled}
        data-tutorial={dataTutorial}
        className={cn(
          COMPOSER_CHIP,
          // Shrinks in tight toolbars; icon-only chips stay a round 28px target
          'shrink',
          !showLabel && 'w-control shrink-0 justify-center px-0',
          isOpen && 'bg-fill-hover text-foreground',
          className
        )}
      >
        {/* Icon area */}
        <span className="flex shrink-0 items-center">
          {icon}
        </span>

        {/* Label - in expanded state or collapsed with selection */}
        {showLabel && (
          isExpanded ? (
            // Expanded: simple truncate; a placeholder label (no selection) reads tertiary
            <span data-badge-label className={cn('min-w-0 max-w-[120px] shrink truncate', !hasSelection && 'text-tertiary')}>
              {label}
            </span>
          ) : (
            // Preserve a visible truncation affordance instead of fading mid-word.
            <span data-badge-label className="max-w-[140px] min-w-0 shrink truncate">
              {label}
            </span>
          )
        )}

        {/* Optional chevron - only in expanded state */}
        {isExpanded && showChevron && (
          <ChevronDown data-badge-label className="size-3.5 shrink-0" />
        )}
      </button>
    )

    // Wrap with tooltip if provided (skip when dropdown is open to avoid showing tooltip)
    if (tooltip && !isOpen) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            {button}
          </TooltipTrigger>
          <TooltipContent side="top">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )
    }

    return button
  }
)
