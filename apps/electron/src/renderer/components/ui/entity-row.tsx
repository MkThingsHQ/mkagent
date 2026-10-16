/**
 * EntityRow — Reusable visual skeleton for list items (sessions, sources, skills, automations, projects).
 *
 * Row anatomy (design spec §7.2): 16px leading glyph · title (13px) · trailing meta (12px tertiary) on the
 * first line; an optional subtitle line (12px secondary) with right-aligned chips; an optional badge row.
 * 36px single-line / 54px two-line. Mail-style: the row spans the panel edge to edge (square
 * `fill-hover` / `fill-selected`, no inset pill), rows are divided by a hairline that starts at the text
 * edge, and selection is a fill, never weight.
 *
 * The "⋯" actions button is a sibling of the row button (never nested inside it), named, and REPLACES the
 * trailing meta on hover/focus instead of overlapping it. In the compact (touch) layout it is always
 * visible and the row reserves room for it.
 *
 * Domain-specific logic (what icon, what badges, what menu items) is injected via slots.
 */

import * as React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
} from '@/components/ui/styled-dropdown'
import {
  ContextMenu,
  ContextMenuTrigger,
  StyledContextMenuContent,
} from '@/components/ui/styled-context-menu'
import { DropdownMenuProvider, ContextMenuProvider } from '@/components/ui/menu-context'
import {
  LONG_PRESS_MS,
  MOVE_TOLERANCE_PX,
  shouldFireLongPress,
} from '@/components/ui/long-press-state'
import { cn } from '@/lib/utils'

/** Window the long-press / right-click handler keeps `suppressNextActivation`
 *  asserted for after the drawer opens. Activation events (`onMouseDown` /
 *  `onClick`) within this window are dropped so the row doesn't get selected
 *  underneath the drawer when the user releases the press. A normal tap is
 *  <300ms, so the window doesn't eat real taps. */
const SUPPRESS_ACTIVATION_MS = 300

export interface EntityRowProps {
  /** Left icon area — rendered in-flow as a flex child before the content column.
   *  Consumers can pass multiple icons (e.g. via a fragment) for a horizontal icon group. */
  icon?: React.ReactNode
  /** Title content (ReactNode for search highlighting support) */
  title: React.ReactNode
  /** Additional className on the title wrapper (e.g. shimmer animation) */
  titleClassName?: string
  /** Content rendered inline after the title (e.g. timestamp). On hover, swapped with the more button.
   *  When set, the title row becomes single-line (truncated) and the absolute more button is hidden. */
  titleTrailing?: React.ReactNode
  /** Content rendered inline immediately after the title, on the same row.
   *  Lives between the title and the trailing slot. Use for tiny, high-priority
   *  inline chips (e.g. platform bindings) that should read as part of the title
   *  area, not as badges below. `shrink-0` so long titles truncate first. */
  titleSuffix?: React.ReactNode
  /** Optional subtitle line beneath the title */
  subtitle?: React.ReactNode
  /** Right-aligned content on the subtitle line (e.g. label chips); keeps the row at two lines */
  subtitleTrailing?: React.ReactNode
  /** Badge/subtitle row beneath the title */
  badges?: React.ReactNode
  /** Right-aligned content in the badge row (timestamp, child toggle) */
  trailing?: React.ReactNode
  /** Content rendered below the main button (e.g. expanded child list) */
  children?: React.ReactNode
  /** Absolutely-positioned overlay (e.g. match count badge) */
  overlay?: React.ReactNode

  // --- Interaction ---
  /** Selection state */
  isSelected?: boolean
  /** Multi-select highlight (left accent bar + tinted bg) */
  isInMultiSelect?: boolean
  /** Suppress the left-edge selection bar (background tint still shows). Used
   *  when an outer wrapper draws its own accent stripe (e.g. project color) at
   *  the same leading edge and the two would collide. */
  suppressSelectionBar?: boolean
  /** Click handler — use onMouseDown for modifier key detection (Session), or onClick for simple cases */
  onMouseDown?: (e: React.MouseEvent) => void
  /** Simple click handler (used when modifier key detection isn't needed) */
  onClick?: () => void
  /** @deprecated Every row draws its own hairline now (mail-style); kept for API compatibility, renders nothing. */
  showSeparator?: boolean

  // --- Menu ---
  /** Menu content — rendered in BOTH dropdown and context menu via providers.
   *  Should be a component that uses useMenuComponents() for its items. */
  menuContent?: React.ReactNode
  /** Context menu content when different from dropdown (e.g. batch menu in multi-select) */
  contextMenuContent?: React.ReactNode
  /** Whether to hide the more button (e.g. when overlay is showing) */
  hideMoreButton?: boolean
  /** Accessible name of the "⋯" button, e.g. "Actions for Weekly digest" (defaults to "More") */
  moreButtonLabel?: string
  /** Whether to render the menu surface in compact (drawer) mode. Pass-through
   *  from the consumer so EntityRow stays generic and usable from playground /
   *  non-AppShell surfaces. Only meaningful in combination with `compactMenu`. */
  isCompactMode?: boolean
  /** Render-prop for the compact (drawer) menu surface. EntityRow owns the
   *  open state (driven by both the `…` button and long-press / right-click)
   *  and hands it to the consumer so a single drawer instance is controlled
   *  by both triggers. When omitted OR `isCompactMode` is false: the
   *  existing dropdown/context-menu behaviour kicks in. */
  compactMenu?: (props: {
    open: boolean
    onOpenChange: (open: boolean) => void
  }) => React.ReactNode

  // --- Passthrough ---
  /** Additional props spread onto the <button> (aria attrs, keyboard handlers, tabIndex, ref) */
  buttonProps?: Record<string, unknown>
  /** Data attributes on the outer wrapper div */
  dataAttributes?: Record<string, string | undefined>
  /** Outer wrapper className */
  className?: string
  /** @deprecated See `showSeparator`. */
  separatorClassName?: string
}

export function EntityRow({
  icon,
  title,
  titleClassName,
  titleTrailing,
  titleSuffix,
  subtitle,
  subtitleTrailing,
  badges,
  trailing,
  children,
  overlay,
  isSelected = false,
  isInMultiSelect = false,
  suppressSelectionBar = false,
  onMouseDown,
  onClick,
  menuContent,
  contextMenuContent,
  hideMoreButton = false,
  moreButtonLabel,
  isCompactMode = false,
  compactMenu,
  buttonProps,
  dataAttributes,
  className,
}: EntityRowProps) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [compactMenuOpen, setCompactMenuOpen] = useState(false)

  // Compact branch only kicks in when both the flag and the render-prop are
  // provided. Desktop callsites that don't pass `compactMenu` keep the
  // existing Radix dropdown/context-menu behaviour.
  const useCompactMenu = isCompactMode && !!compactMenu

  // Long-press + suppression state. Refs (not React state) because the
  // pointer event handlers run outside React's commit cycle — updating state
  // would re-render the row on every move, which we explicitly don't want.
  const pointerDownRef = React.useRef<{
    x: number
    y: number
    timer: number
  } | null>(null)
  const suppressNextActivationRef = React.useRef(false)

  const cancelLongPress = React.useCallback(() => {
    if (pointerDownRef.current) {
      window.clearTimeout(pointerDownRef.current.timer)
      pointerDownRef.current = null
    }
  }, [])

  // Cleanup pending long-press timer on unmount — otherwise a row that
  // unmounts mid-press would fire its callback after the React tree is gone.
  React.useEffect(() => {
    return () => {
      if (pointerDownRef.current) {
        window.clearTimeout(pointerDownRef.current.timer)
        pointerDownRef.current = null
      }
    }
  }, [])

  const armSuppression = React.useCallback(() => {
    suppressNextActivationRef.current = true
    window.setTimeout(() => {
      suppressNextActivationRef.current = false
    }, SUPPRESS_ACTIVATION_MS)
  }, [])

  const openCompactMenuFromGesture = React.useCallback(() => {
    setCompactMenuOpen(true)
    armSuppression()
  }, [armSuppression])

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      // Mouse uses the native context menu path (onContextMenu). Touch / pen
      // are the only inputs that need the long-press fallback.
      if (e.pointerType === 'mouse') return
      const start = { x: e.clientX, y: e.clientY }
      const timer = window.setTimeout(() => {
        openCompactMenuFromGesture()
        pointerDownRef.current = null
      }, LONG_PRESS_MS)
      pointerDownRef.current = { ...start, timer }
    },
    [openCompactMenuFromGesture],
  )

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      const state = pointerDownRef.current
      if (!state) return
      const decision = shouldFireLongPress(
        { x: state.x, y: state.y },
        { x: e.clientX, y: e.clientY },
        0, // elapsedMs is irrelevant for the move-cancellation path
        LONG_PRESS_MS,
        MOVE_TOLERANCE_PX,
      )
      if (decision.cancel) cancelLongPress()
    },
    [cancelLongPress],
  )

  const onContextMenuCompact = React.useCallback(
    (e: React.MouseEvent) => {
      // Desktop right-click in compact mode: open the drawer instead of
      // falling through to the native context menu (no Radix ContextMenu is
      // rendered in the compact branch).
      e.preventDefault()
      openCompactMenuFromGesture()
    },
    [openCompactMenuFromGesture],
  )

  // Wrap consumer handlers so a long-press / right-click that just opened
  // the drawer doesn't also trigger row selection on pointer release.
  const wrappedOnMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      if (suppressNextActivationRef.current) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      onMouseDown?.(e)
    },
    [onMouseDown],
  )

  const wrappedOnClick = React.useCallback(() => {
    if (suppressNextActivationRef.current) return
    onClick?.()
  }, [onClick])

  // In compact mode we don't render Radix ContextMenu, so don't expose the
  // override either — the batch menu / right-click is handled by the drawer.
  // In desktop mode the existing fallback applies.
  const resolvedContextMenu = useCompactMenu
    ? null
    : contextMenuContent ?? menuContent

  const anyMenuOpen = menuOpen || contextMenuOpen || compactMenuOpen
  const hasMoreButton = (!!menuContent || useCompactMenu) && !hideMoreButton
  const moreLabel = moreButtonLabel ?? t('common.more')
  const iconSpacer = icon ? (
    <div className="shrink-0 flex items-center gap-2 [&>*]:size-4 invisible" aria-hidden="true">
      {icon}
    </div>
  ) : null

  // Build the inner content (shared between with-context-menu and without).
  // Layout grid: the row fills the panel edge to edge and pads the 16px gutter, so the glyph lands on
  // the gutter (where the panel title and group labels start) and the text 26px further in (42px). The
  // hairline below each row starts at that text edge and runs to the panel edge (hidden on the selected
  // row, whose fill already separates it).
  const innerContent = (
    <div
      className={cn(
        "relative group select-none",
        "after:pointer-events-none after:absolute after:right-0 after:bottom-0 after:h-px after:bg-separator in-data-[selected]:after:hidden",
        icon ? "after:left-[calc(var(--gutter)+26px)]" : "after:left-gutter",
      )}
    >
      {/* Multi-select marker. Single selection is the row fill alone; suppressed when an outer
          wrapper draws its own leading stripe (e.g. project color) at the same edge. */}
      {isInMultiSelect && !suppressSelectionBar && (
        <div className="absolute left-0 inset-y-0 w-[3px] bg-accent-solid" />
      )}

      {/* Main content button */}
      <button
        {...(buttonProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        className={cn(
          "entity-row-btn flex w-full items-start py-[9px] px-gutter text-left text-label -outline-offset-2",
          // Hover-in instant, hover-out 100ms
          "transition-[background-color] duration-micro ease-out-subtle hover:duration-instant",
          (isSelected || isInMultiSelect)
            ? "bg-fill-selected"
            : "hover:bg-fill-hover",
          // Touch: the always-visible actions button sits at the right edge (its 36px box + 6px inset)
          hasMoreButton && useCompactMenu && "pr-11",
          (buttonProps as Record<string, unknown>)?.className as string | undefined,
        )}
        onMouseDown={wrappedOnMouseDown}
        onClick={!onMouseDown ? wrappedOnClick : undefined}
        onPointerDown={useCompactMenu ? onPointerDown : undefined}
        onPointerMove={useCompactMenu ? onPointerMove : undefined}
        onPointerUp={useCompactMenu ? cancelLongPress : undefined}
        onPointerCancel={useCompactMenu ? cancelLongPress : undefined}
        onPointerLeave={useCompactMenu ? cancelLongPress : undefined}
        onContextMenu={useCompactMenu ? onContextMenuCompact : undefined}
      >
        {/* Content column */}
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          {/* Title line: glyph · title · suffix · trailing meta */}
          <div className="flex items-center gap-2.5 w-full min-w-0">
            {icon && (
              <div className="shrink-0 flex items-center gap-2 [&>*]:size-4">
                {icon}
              </div>
            )}
            <div data-slot="entity-row-title" className={cn(
              "font-sans min-w-0 text-foreground",
              titleTrailing ? "truncate" : "line-clamp-2",
              titleClassName,
            )}>
              {title}
            </div>
            {titleSuffix && <div className="shrink-0 flex items-center">{titleSuffix}</div>}
            {titleTrailing && (
              <div
                data-slot="entity-row-meta"
                className={cn(
                  "shrink-0 ml-auto pl-2 flex items-center text-label-sm text-tertiary tabular-nums whitespace-nowrap",
                  // The actions button replaces the meta on hover/focus (desktop) — never overlaps it
                  hasMoreButton && !useCompactMenu && (anyMenuOpen ? "invisible" : "group-hover:invisible group-focus-within:invisible"),
                )}
              >
                {titleTrailing}
              </div>
            )}
          </div>

          {/* Subtitle line */}
          {(subtitle || subtitleTrailing) && (
            <div data-slot="entity-row-subtitle" className="flex items-center gap-2.5 w-full min-w-0 text-label-sm text-secondary">
              {iconSpacer}
              {subtitle && <div className="min-w-0 flex-1 truncate">{subtitle}</div>}
              {subtitleTrailing && (
                // A stable, row-owned budget prevents chip fitting from measuring its own output.
                // With no subtitle, labels can use the whole remaining line.
                <div className={cn('min-w-0 flex items-center gap-1', subtitle ? 'shrink-0 w-[55%]' : 'flex-1')}>
                  {subtitleTrailing}
                </div>
              )}
            </div>
          )}

          {/* Badges / metadata row */}
          {(badges || trailing) && (
            <div className="flex items-center gap-2.5 text-label-sm text-secondary w-full min-w-0 pt-0.5">
              {iconSpacer}
              {badges && (
                <div
                  className="flex-1 flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-hide"
                  style={{
                    maskImage: 'linear-gradient(to right, black calc(100% - 16px), transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 16px), transparent 100%)',
                  }}
                >
                  {badges}
                </div>
              )}
              {trailing && (
                <div className="shrink-0 flex items-center gap-1 ml-auto text-tertiary tabular-nums">
                  {trailing}
                </div>
              )}
            </div>
          )}
        </div>
      </button>

      {/* Children rendered below the button */}
      {children}

      {/* Overlay (e.g. match count badge) */}
      {overlay}

      {/* Actions button — a named sibling of the row button. Desktop: revealed on hover/focus or while its
          menu is open, in the trailing meta's place. Compact (touch): always visible at the right edge. */}
      {hasMoreButton && (
        <div
          data-touch-reveal="true"
          className={cn(
            "absolute z-10 flex items-center",
            // Either way the glyph lands 16px from the panel edge, on the gutter: 24px desktop button at 12px,
            // 36px touch button at 6px.
            useCompactMenu ? "right-1.5 top-1/2 -translate-y-1/2" : "right-3 top-1.5",
            anyMenuOpen || useCompactMenu
              ? "opacity-100"
              : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto",
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {useCompactMenu ? (
            <button
              type="button"
              onClick={() => setCompactMenuOpen(true)}
              className="inline-grid place-items-center size-9 rounded-md text-secondary hover:bg-fill-pressed hover:text-foreground"
              aria-label={moreLabel}
              aria-haspopup="dialog"
              aria-expanded={compactMenuOpen}
            >
              <MoreHorizontal className="size-4" />
            </button>
          ) : (
            <DropdownMenu modal={true} open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  // Rows are reached with the list's own keyboard navigation; the button stays out of
                  // the Tab order (the context menu key / right-click reach the same menu).
                  tabIndex={-1}
                  aria-label={moreLabel}
                  className="inline-grid place-items-center size-6 rounded-sm text-secondary hover:bg-fill-pressed hover:text-foreground data-[state=open]:bg-fill-pressed data-[state=open]:text-foreground"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <StyledDropdownMenuContent align="end">
                <DropdownMenuProvider>
                  {menuContent}
                </DropdownMenuProvider>
              </StyledDropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {/* Compact drawer mount — the render-prop is rendered here as a
       *  sibling of the row so the drawer's portal can mount above the
       *  current panel without being clipped by the row's overflow. */}
      {useCompactMenu && compactMenu?.({
        open: compactMenuOpen,
        onOpenChange: setCompactMenuOpen,
      })}
    </div>
  )

  return (
    <div
      className={className}
      data-selected={isSelected || undefined}
      {...dataAttributes}
    >
      {/* Wrap with ContextMenu if menu content is provided */}
      {resolvedContextMenu ? (
        <ContextMenu modal={true} onOpenChange={setContextMenuOpen}>
          <ContextMenuTrigger asChild>
            {innerContent}
          </ContextMenuTrigger>
          <StyledContextMenuContent>
            <ContextMenuProvider>
              {resolvedContextMenu}
            </ContextMenuProvider>
          </StyledContextMenuContent>
        </ContextMenu>
      ) : (
        innerContent
      )}
    </div>
  )
}
