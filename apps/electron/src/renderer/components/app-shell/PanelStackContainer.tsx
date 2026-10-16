/**
 * PanelStackContainer
 *
 * Horizontal layout container for ALL panels:
 * Sidebar → Navigator → Content Panel(s) with resize sashes.
 *
 * Content panels use CSS flex-grow with their proportions as weights:
 * - Each panel gets `flex: <proportion> 1 0px` with `min-width: PANEL_MIN_WIDTH`
 * - Flex distributes available space proportionally — panels fill the viewport
 * - When panels hit min-width, overflow-x: auto kicks in naturally
 *
 * Sidebar and Navigator are NOT part of the proportional layout —
 * they have their own fixed/user-resizable widths managed by AppShell.
 * They just reduce the available width for content panels and scroll with everything else.
 *
 * Materials (design spec §7.1): the sidebar sits flush on the navigator canvas; the navigator (list)
 * and the first content panel share ONE paper card — they are joined edge to edge and the list's
 * hairline is the divider. Additional panels get their own card.
 *
 * Motion (spec §6.3): collapsing/expanding the sidebar or the list commits the layout ONCE and FLIPs
 * the cards from where they were (transform only — no width/margin/padding animation, so no layout
 * per frame). The card material scales while the content translates, so text never stretches.
 * Keyboard toggles (⌘B, ⌘.) are instant, as are drags and the compact layout.
 *
 * Compact mode (mobile / narrow window):
 * The flex layout is replaced with an absolute-positioned, transform-animated
 * stack — navigator and the focused content panel both stay mounted and slide
 * in/out via CompactPanelTransition. This produces an iOS UINavigationController
 * feel rather than a CSS reflow.
 */

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { useAtomValue } from 'jotai'
import { FlipOnChange, cancelFlip, cancelSlideOut, playSlideX, SPRING, type FlipTarget } from '@mkagent/ui/motion'
import { cn } from '@/lib/utils'
import { useToastAnchor } from '@/components/ui/sonner'
import { panelStackAtom, focusedPanelIdAtom, focusedPanelRouteAtom } from '@/atoms/panel-stack'
import { parseRouteToNavigationState } from '../../../shared/route-parser'
import { isDetailNavState } from '@/lib/nav-helpers'
import { PanelSlot, type PanelSlotElements } from './PanelSlot'
import { PanelResizeSash } from './PanelResizeSash'
import { CompactPanelTransition } from './CompactPanelTransition'
import {
  PANEL_GAP,
  PANEL_EDGE_INSET,
  PANEL_STACK_VERTICAL_OVERFLOW,
  RADIUS_EDGE,
  RADIUS_INNER,
} from './panel-constants'

/** Visual breathing room between the fixed compact TopBar and the first panel. */
const COMPACT_PANEL_TOP_GAP = 8

interface PanelStackContainerProps {
  sidebarSlot: React.ReactNode
  sidebarWidth: number
  navigatorSlot: React.ReactNode
  navigatorWidth: number
  isSidebarAndNavigatorHidden: boolean
  isRightSidebarVisible?: boolean
  /** Compact mode: single-panel, list/content toggle (mobile or narrow window) */
  isCompact?: boolean
  isResizing?: boolean
  /**
   * Whether showing/hiding the sidebar or the list animates. AppShell passes false for keyboard
   * toggles (⌘B, ⌘.): keyboard and high-frequency actions are instant (spec §6.1).
   */
  animateLayout?: boolean
}

export function PanelStackContainer({
  sidebarSlot,
  sidebarWidth,
  navigatorSlot,
  navigatorWidth,
  isSidebarAndNavigatorHidden,
  isRightSidebarVisible,
  isCompact = false,
  isResizing,
  animateLayout = true,
}: PanelStackContainerProps) {
  const panelStack = useAtomValue(panelStackAtom)
  const focusedPanelId = useAtomValue(focusedPanelIdAtom)
  const focusedRoute = useAtomValue(focusedPanelRouteAtom)

  const contentPanels = panelStack

  // Compact mode: drill-in is "detail focused", not just "session selected".
  // For sessions: a session is selected. For settings: a subpage is selected.
  // For Skills: a detail entity is selected.
  const focusedNavState = focusedRoute ? parseRouteToNavigationState(focusedRoute) : null
  const isDetailFocused = isDetailNavState(focusedNavState)
  const hasSelectedContent = isCompact && isDetailFocused

  const visiblePanels = isCompact
    ? contentPanels.filter(e => e.id === focusedPanelId).slice(0, 1)
    : contentPanels

  const scrollRef = useRef<HTMLDivElement>(null)
  const sidebarElRef = useRef<HTMLDivElement>(null)
  const navigatorElRef = useRef<HTMLDivElement>(null)
  const panelEls = useRef(new Map<string, PanelSlotElements>())
  const prevCountRef = useRef(contentPanels.length)

  const hasSidebar = sidebarWidth > 0
  const hasNavigator = navigatorWidth > 0
  const isMultiPanel = visiblePanels.length > 1
  const isLeftEdge = !hasSidebar && !hasNavigator
  // The list and the first content panel read as one paper card.
  const isJoined = hasNavigator && visiblePanels.length > 0

  // Toasts sit inside the content card's first pane, bottom-left — never over the sidebar (spec D10).
  useToastAnchor(
    isCompact ? null : hasSidebar ? sidebarWidth + PANEL_GAP : PANEL_EDGE_INSET,
    hasNavigator ? navigatorWidth : null,
  )

  // Auto-scroll to newly pushed content panel (desktop multi-panel only).
  // Compact mode is single-panel so there's nothing to scroll into view.
  useEffect(() => {
    if (contentPanels.length > prevCountRef.current && scrollRef.current && !isCompact) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          left: scrollRef.current.scrollWidth,
          behavior: 'smooth',
        })
      })
    }
    prevCountRef.current = contentPanels.length
  }, [contentPanels.length, isCompact])

  // --- Sidebar exit: the sidebar leaves the flow at once but stays painted, sliding out under the
  // cards that FLIP over it (mockup `toggleSidebar`). It's an absolute overlay while it exits.
  const [sidebarExiting, setSidebarExiting] = useState(false)
  const pendingExitRef = useRef(false)
  const showSidebarOverlay = sidebarExiting && !hasSidebar

  // While cards are translated past the stack's right edge the scroller must not grow a scrollbar:
  // hold overflow-x hidden (scroll position is kept) until the last running animation settles.
  const overflowHoldRef = useRef<{ count: number; saved: string }>({ count: 0, saved: '' })
  const holdOverflow = useCallback((animations: Animation[]) => {
    const scroller = scrollRef.current
    if (!scroller || animations.length === 0) return
    const hold = overflowHoldRef.current
    if (hold.count === 0) {
      hold.saved = scroller.style.overflowX
      scroller.style.overflowX = 'hidden'
    }
    hold.count += 1
    const release = () => {
      hold.count -= 1
      if (hold.count === 0 && scrollRef.current) scrollRef.current.style.overflowX = hold.saved
    }
    Promise.allSettled(animations.map((a) => a.finished)).then(release)
  }, [])

  const getFlipTargets = useCallback((): FlipTarget[] => {
    const targets: FlipTarget[] = []
    if (navigatorElRef.current) targets.push({ el: navigatorElRef.current })
    for (const { panel, material } of panelEls.current.values()) {
      if (panel) targets.push({ el: panel })
      if (material) targets.push({ el: material, mode: 'scale' })
    }
    return targets
  }, [])

  const handleFlipPlayed = useCallback((animations: Animation[], change: { from: unknown; to: unknown }) => {
    holdOverflow(animations)
    const [hadSidebar] = String(change.from).split(':')
    const [nowSidebar] = String(change.to).split(':')
    const sidebarEl = sidebarElRef.current
    if (!sidebarEl || hadSidebar === nowSidebar) return
    cancelFlip([sidebarEl])
    if (nowSidebar === '1') {
      // Opening: the sidebar slides in from the left while the cards glide right.
      const slide = playSlideX(sidebarEl, -(sidebarWidth + PANEL_GAP), 0, SPRING.panel)
      if (slide) holdOverflow([slide])
    } else if (animations.length > 0) {
      pendingExitRef.current = true
      setSidebarExiting(true)
    }
  }, [holdOverflow, sidebarWidth])

  // Slide the exiting overlay out, then drop it.
  useLayoutEffect(() => {
    if (!showSidebarOverlay || !pendingExitRef.current) return
    pendingExitRef.current = false
    const el = sidebarElRef.current
    const slide = el ? playSlideX(el, 0, -(sidebarWidth + PANEL_GAP), SPRING.panel) : null
    if (!slide) {
      setSidebarExiting(false)
      return
    }
    holdOverflow([slide])
    // The exit slide holds its end state; hide the overlay in the same frame the hold is released.
    slide.finished.then(
      () => {
        flushSync(() => setSidebarExiting(false))
        slide.cancel()
      },
      () => setSidebarExiting(false),
    )
  }, [showSidebarOverlay, sidebarWidth, holdOverflow])

  // Shown again mid-exit (e.g. ⌘B twice): drop the exit slide so the sidebar shows in place.
  useLayoutEffect(() => {
    if (hasSidebar && sidebarExiting) {
      cancelSlideOut([sidebarElRef.current])
      setSidebarExiting(false)
    }
  }, [hasSidebar, sidebarExiting])

  const registerPanel = useCallback((id: string, els: PanelSlotElements | null) => {
    if (els) panelEls.current.set(id, els)
    else panelEls.current.delete(id)
  }, [])

  // === COMPACT BRANCH ===
  // Single-panel layout with iOS-style slide between navigator and detail.
  // Both stay in the DOM; CompactPanelTransition transforms whichever should be
  // off-screen. Sidebar is hidden by AppShell in compact mode (sidebarWidth = 0).
  if (isCompact) {
    const focusedEntry = visiblePanels[0]
    return (
      <div
        ref={scrollRef}
        data-mobile-menu-root="true"
        className="flex-1 min-w-0 relative panel-scroll @container/shell"
        style={{
          paddingBlock: PANEL_STACK_VERTICAL_OVERFLOW,
          marginBlock: -PANEL_STACK_VERTICAL_OVERFLOW,
          marginBottom: -6,
          paddingBottom: 6,
          '--compact-panel-stack-top': `${PANEL_STACK_VERTICAL_OVERFLOW + COMPACT_PANEL_TOP_GAP}px`,
        } as React.CSSProperties}
      >
        {/* Navigator slot — full width, slides left to -30% when detail focused. */}
        {hasNavigator && (
          <CompactPanelTransition role="navigator" isDetailActive={hasSelectedContent}>
            <div
              data-panel-role="navigator"
              className="shell-card h-full w-full overflow-hidden relative bg-paper shadow-elev-0"
              style={{
                // Compact mode runs flush to the viewport floor — no rounded bottom.
                borderTopLeftRadius: RADIUS_INNER,
                borderBottomLeftRadius: 0,
                borderTopRightRadius: RADIUS_INNER,
                borderBottomRightRadius: 0,
              }}
            >
              {navigatorSlot}
            </div>
          </CompactPanelTransition>
        )}

        {/* Content slot — full width, slides in from the right when detail focused. */}
        {focusedEntry && (
          <CompactPanelTransition role="detail" isDetailActive={hasSelectedContent}>
            <div className="h-full w-full flex">
              <PanelSlot
                key={focusedEntry.id}
                entry={focusedEntry}
                isOnly={true}
                isFocusedPanel={true}
                isSidebarAndNavigatorHidden={isSidebarAndNavigatorHidden}
                isAtLeftEdge={isLeftEdge}
                isAtRightEdge={!isRightSidebarVisible}
                proportion={focusedEntry.proportion}
                isCompact={true}
              />
            </div>
          </CompactPanelTransition>
        )}
      </div>
    )
  }

  // === DESKTOP BRANCH ===
  const flipEnabled = animateLayout && !isResizing
  const layoutKey = `${hasSidebar ? 1 : 0}:${hasNavigator ? 1 : 0}`

  return (
    <div
      ref={scrollRef}
      data-mobile-menu-root="true"
      className="flex-1 min-w-0 flex relative z-panel panel-scroll @container/shell"
      style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        paddingBlock: PANEL_STACK_VERTICAL_OVERFLOW,
        marginBlock: -PANEL_STACK_VERTICAL_OVERFLOW,
        marginBottom: -6,
        paddingBottom: 6,
        paddingRight: 8,
        marginRight: -8,
      }}
    >
      <FlipOnChange value={layoutKey} enabled={flipEnabled} getTargets={getFlipTargets} axis="x" onPlay={handleFlipPlayed}>
        <div
          className="flex h-full relative"
          style={{ gap: PANEL_GAP, flexGrow: 1, minWidth: 0, paddingLeft: hasSidebar ? 0 : PANEL_EDGE_INSET }}
        >
          {/* === SIDEBAR SLOT === (flush on the navigator canvas — no card) */}
          <div
            ref={sidebarElRef}
            data-panel-role="sidebar"
            className="h-full shrink-0"
            style={
              hasSidebar
                ? { width: sidebarWidth, position: 'relative' }
                : showSidebarOverlay
                  ? { position: 'absolute', left: 0, top: 0, bottom: 0, width: sidebarWidth, pointerEvents: 'none' }
                  : { width: 0, marginRight: -PANEL_GAP, overflowX: 'clip', opacity: 0 }
            }
          >
            <div className="h-full" style={{ width: sidebarWidth }}>
              {sidebarSlot}
            </div>
          </div>

          {/* === NAVIGATOR SLOT === (left half of the shared paper card) */}
          <div
            ref={navigatorElRef}
            data-panel-role="navigator"
            className={cn(
              'shell-card h-full overflow-hidden relative shrink-0 z-[2] bg-paper',
              hasNavigator && 'shadow-elev-0',
            )}
            style={{
              width: hasNavigator ? navigatorWidth : 0,
              marginRight: hasNavigator ? 0 : -PANEL_GAP,
              opacity: hasNavigator ? 1 : 0,
              borderTopLeftRadius: RADIUS_INNER,
              borderBottomLeftRadius: !hasSidebar ? RADIUS_EDGE : RADIUS_INNER,
              borderTopRightRadius: isJoined ? 0 : RADIUS_INNER,
              borderBottomRightRadius: isJoined ? 0 : RADIUS_INNER,
            }}
          >
            <div className="h-full" style={{ width: navigatorWidth }}>
              {navigatorSlot}
            </div>
          </div>

          {/* === CONTENT PANELS WITH SASHES === */}
          {visiblePanels.length === 0 ? (
            <div className="flex-1 flex items-center justify-center" />
          ) : (
            visiblePanels.map((entry, index) => (
              <PanelSlot
                key={entry.id}
                entry={entry}
                isOnly={visiblePanels.length === 1}
                isFocusedPanel={isMultiPanel ? entry.id === focusedPanelId : true}
                isSidebarAndNavigatorHidden={isSidebarAndNavigatorHidden}
                isAtLeftEdge={index === 0 && isLeftEdge}
                isAtRightEdge={index === visiblePanels.length - 1 && !isRightSidebarVisible}
                isJoinedToNavigator={index === 0 && isJoined}
                proportion={entry.proportion}
                isCompact={false}
                onElements={registerPanel}
                sash={index > 0 ? (
                  <PanelResizeSash
                    leftIndex={index - 1}
                    rightIndex={index}
                  />
                ) : undefined}
              />
            ))
          )}
        </div>
      </FlipOnChange>
    </div>
  )
}
