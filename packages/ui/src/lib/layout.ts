/**
 * Shared layout constants for chat UI
 *
 * These values ensure visual consistency between Electron and web viewer.
 * Import and use these in both ChatDisplay (Electron) and SessionViewer (UI package).
 */

/**
 * Overlay layout configuration
 * Controls when overlays show as modals vs fullscreen
 */
export const OVERLAY_LAYOUT = {
  /** Minimum viewport width for modal display (below this = fullscreen) */
  /** Set very high to always use fullscreen mode */
  modalBreakpoint: 99999,
  /** Modal max width */
  modalMaxWidth: 1100,
  /** Modal max height as percentage of viewport */
  modalMaxHeightPercent: 85,
  /** Backdrop class for modal mode (semi-transparent scrim role) */
  modalBackdropClass: 'bg-scrim',
  /** Backdrop class for fullscreen mode (solid) */
  fullscreenBackdropClass: 'bg-background',
} as const

/**
 * Chat layout configuration (design spec §4/§7.4, mockup `.column` / `.tx`):
 * a 720px text column with 24px gutters (14px in compact), turns 20px apart.
 * The composer zone shares `maxWidth`, so it lines up with the transcript.
 */
export const CHAT_LAYOUT = {
  /** Max width for chat content area: 720px column + 2 × 24px gutters */
  maxWidth: 'max-w-[768px]',

  /** Horizontal padding for main container */
  containerPaddingX: 'px-6',

  /** Vertical padding for main container (clears the 32px edge fade of the scroll area) */
  containerPaddingY: 'pt-6 pb-8',

  /** Combined container padding */
  containerPadding: 'px-6 pt-6 pb-8',

  /** Container padding in compact layouts (compact shell ≤ 767px, popovers): the 16px panel gutter,
   *  shared with the compact header's glyphs and the composer card, so the screen has one left edge */
  compactContainerPadding: 'px-gutter pt-4 pb-6',

  /** Vertical spacing between messages/turns (20px) */
  messageSpacing: 'flex flex-col gap-5',

  /** Extra padding for user messages — none: the column rhythm separates turns */
  userMessagePadding: '',

  /** Bottom branding area padding */
  brandingPadding: 'pt-16 pb-24',
} as const

/**
 * Composed class strings for common patterns
 */
export const CHAT_CLASSES = {
  /** Main message container: max-width + centered + padding + spacing */
  messageContainer: `${CHAT_LAYOUT.maxWidth} mx-auto ${CHAT_LAYOUT.containerPadding} ${CHAT_LAYOUT.messageSpacing}`,

  /** User message wrapper with padding */
  userMessageWrapper: CHAT_LAYOUT.userMessagePadding,

  /** Bottom branding container */
  brandingContainer: `flex justify-center ${CHAT_LAYOUT.brandingPadding}`,
} as const

// ============================================================================
// Responsive Overlay Hook
// ============================================================================

import { useState, useEffect } from 'react'

export type OverlayMode = 'modal' | 'fullscreen'

/**
 * Hook to determine if overlay should show as modal or fullscreen
 * based on viewport size.
 *
 * @returns 'modal' if viewport is large enough, 'fullscreen' otherwise
 */
export function useOverlayMode(): OverlayMode {
  const [mode, setMode] = useState<OverlayMode>(() => {
    if (typeof window === 'undefined') return 'fullscreen'
    return window.innerWidth >= OVERLAY_LAYOUT.modalBreakpoint ? 'modal' : 'fullscreen'
  })

  useEffect(() => {
    const handleResize = () => {
      const newMode = window.innerWidth >= OVERLAY_LAYOUT.modalBreakpoint ? 'modal' : 'fullscreen'
      setMode(newMode)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return mode
}
