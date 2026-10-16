/**
 * PanelHeader - Standardized header component for panels
 *
 * Provides consistent header styling with:
 * - Fixed 48px height (design spec §4 chrome); the title is left-aligned on desktop and centered in compact
 * - Title with optional badge, or a custom title row (the chat header, `ChatHeader`)
 * - Optional action buttons
 * - Automatic padding compensation for macOS traffic lights (via StoplightContext)
 *
 * Usage:
 * ```tsx
 * <PanelHeader
 *   title="Conversations"
 *   actions={<Button>Add</Button>}
 * />
 * ```
 *
 * The header automatically compensates for macOS traffic lights when rendered
 * inside a StoplightProvider (e.g., in MainContentPanel during focused mode).
 * You can also explicitly control this with the `compensateForStoplight` prop.
 */

import * as React from 'react'
import { motion } from 'motion/react'
import { TWEEN } from '@mkagent/ui/motion'
import { cn } from '@/lib/utils'
import { useCompensateForStoplight } from '@/context/StoplightContext'
import { useAppShellContext } from '@/context/AppShellContext'

// Padding to compensate for macOS traffic lights (stoplight buttons)
// Traffic lights positioned at x:18, ~52px wide = 70px + 14px gap
const STOPLIGHT_PADDING = 84

// Compact header controls are 44px touch targets with a 6px flex gap.
// Reserve the real occupied width for the centered title so long titles truncate
// before the right-side action cluster instead of rendering underneath it.
const COMPACT_HEADER_SIDE_PADDING = 8
const COMPACT_HEADER_BUTTON_SIZE = 44
const COMPACT_HEADER_GAP = 6
const COMPACT_HEADER_TITLE_GAP = 8

function compactTitleInset(controlCount: number): number {
  if (controlCount <= 0) return 16
  return COMPACT_HEADER_SIDE_PADDING
    + (controlCount * COMPACT_HEADER_BUTTON_SIZE)
    + (controlCount * COMPACT_HEADER_GAP)
    + COMPACT_HEADER_TITLE_GAP
}

export interface PanelHeaderProps {
  /** Header title (undefined hides with animation) */
  title?: string
  /** Optional badge element (e.g., agent badge) */
  badge?: React.ReactNode
  /**
   * Custom title row replacing `title`/`badge` (the chat header's status · title · meta · labels).
   * Rendered in flow and left-aligned in both layouts, without a clipping wrapper, so its controls
   * keep their focus rings; it must truncate its own text.
   */
  titleRow?: React.ReactNode
  /** Optional leading action rendered before the title (e.g., back button in compact mode) */
  leadingAction?: React.ReactNode
  /** Optional center button rendered between title and right actions */
  centerButton?: React.ReactNode
  /** Optional action buttons rendered on the right */
  actions?: React.ReactNode
  /** Optional right sidebar button (rendered after actions) */
  rightSidebarButton?: React.ReactNode
  /** When true, pads the left edge to clear the macOS traffic lights (use when this is the first panel on screen) */
  compensateForStoplight?: boolean
  /** Left padding override (e.g., for focused mode with traffic lights) */
  paddingLeft?: string
  /** Optional className for additional styling */
  className?: string
}

/**
 * Standardized panel header with title and actions
 */
export function PanelHeader({
  title,
  badge,
  titleRow,
  leadingAction: explicitLeadingAction,
  centerButton,
  actions,
  rightSidebarButton,
  compensateForStoplight,
  paddingLeft,
  className,
}: PanelHeaderProps) {
  // Fall back to AppShellContext.leadingAction so per-panel back buttons (set by
  // PanelSlot in compact mode) propagate to every page's PanelHeader without each
  // page having to forward the prop manually.
  const { leadingAction: contextLeadingAction, isCompactMode } = useAppShellContext()
  const leadingAction = explicitLeadingAction ?? contextLeadingAction

  // Use context as fallback when prop is not explicitly set.
  // Skip stoplight compensation when leadingAction is present — the back button
  // occupies the space where traffic lights would be.
  const contextCompensate = useCompensateForStoplight()
  const shouldCompensate = leadingAction ? false : (compensateForStoplight ?? contextCompensate)

  const titleNode = (
    <motion.div
      initial={false}
      animate={{ opacity: title ? 1 : 0 }}
      transition={TWEEN.fast}
      className="flex items-center gap-1 min-w-0"
    >
      {/* Pages whose title lives in their content (settings, detail heroes) pass none: no empty heading */}
      {title && (
        <h1 className="text-label-lg font-semibold truncate font-sans">{title}</h1>
      )}
      {badge}
    </motion.div>
  )

  // Compact (mobile) layout puts a plain title in an absolute-positioned overlay.
  // The side insets are based on the actual number of control slots so a long
  // title truncates before the right-side action cluster instead of overlapping it.
  const compactLeadingControlCount = leadingAction ? 1 : 0
  const compactTrailingControlCount = [centerButton, actions, rightSidebarButton].filter(Boolean).length
  const compactTitleInsetStyle = {
    left: compactTitleInset(compactLeadingControlCount),
    right: compactTitleInset(compactTrailingControlCount),
  }

  const content = isCompactMode && !titleRow ? (
    <>
      {leadingAction && (
        <div className="titlebar-no-drag shrink-0 z-[1]">
          {leadingAction}
        </div>
      )}
      <div className="flex-1" />
      {centerButton && (
        <div className="titlebar-no-drag shrink-0 z-[1]">
          {centerButton}
        </div>
      )}
      {actions && (
        <div className="titlebar-no-drag shrink-0 z-[1]">
          {actions}
        </div>
      )}
      {rightSidebarButton && (
        <div className="titlebar-no-drag shrink-0 z-[1]">
          {rightSidebarButton}
        </div>
      )}
      <div
        className="absolute inset-y-0 flex items-center justify-center pointer-events-none"
        style={compactTitleInsetStyle}
      >
        <div className="max-w-full overflow-hidden pointer-events-auto">
          {titleNode}
        </div>
      </div>
    </>
  ) : (
    <>
      {leadingAction && (
        <div className="titlebar-no-drag shrink-0">
          {leadingAction}
        </div>
      )}
      <div className="flex-1 min-w-0 flex items-center select-none">
        {titleRow ?? (
          <div className="max-w-full overflow-hidden">
            {titleNode}
          </div>
        )}
      </div>
      {centerButton && (
        <div className="titlebar-no-drag shrink-0">
          {centerButton}
        </div>
      )}
      {actions && (
        <div className="titlebar-no-drag shrink-0">
          {actions}
        </div>
      )}
      {rightSidebarButton && (
        <div className="titlebar-no-drag shrink-0">
          {rightSidebarButton}
        </div>
      )}
    </>
  )

  // Layout grid: the panel's content edge is the 16px gutter. A plain title starts on it; icon
  // buttons at either end bleed past it by their inner padding, so their GLYPHS sit on the gutter
  // (28px desktop buttons: 6px; 44px compact buttons with 24px glyphs: 10px). The compact back button
  // starts at the panel edge and pads its chevron so the chevron's ink lands on the gutter.
  const inset = isCompactMode && leadingAction
    ? 'pl-0'
    : isCompactMode && titleRow
      ? 'pl-1.5'
      : leadingAction || titleRow ? 'pl-2.5' : 'pl-gutter'

  const baseClassName = cn(
    'flex shrink-0 items-center min-w-0 gap-1.5 relative z-panel h-12',
    isCompactMode ? 'pr-1.5' : 'pr-2.5',
    // Traffic-light compensation is a layout change: it applies at once (spec §6.1 — padding never animates).
    !shouldCompensate && (paddingLeft || inset),
    className
  )

  return (
    <div
      className={baseClassName}
      style={shouldCompensate ? { paddingLeft: STOPLIGHT_PADDING } : undefined}
    >
      {content}
    </div>
  )
}
