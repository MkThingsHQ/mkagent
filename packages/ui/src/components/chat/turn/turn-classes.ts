/**
 * Shared sizes and class strings for the turn card pieces (design spec §7.4, §6.3–6.4).
 *
 * Class strings live in one place so the work log, tool rows and answer stay on the same
 * grid. Keep every class literal (no string building): Tailwind only generates what it can
 * read in the source.
 */
import type * as React from 'react'

/** Shared size configuration for activity UI - exported for reuse in inline execution */
export const SIZE_CONFIG = {
  /** Base font size class for all text */
  fontSize: 'text-label',
  /** Icon size class (width and height) */
  iconSize: 'size-3.5',
  /** Spinner text size class (the spinner is 1em) */
  spinnerSize: 'text-caption',
  /** Small spinner for header */
  spinnerSizeSmall: 'text-caption',
  /** Activity row height in pixels (approx for calculation) */
  activityRowHeight: 28,
  /** Max visible activities before scrolling (show ~15 items) */
  maxVisibleActivities: 15,
  /** Number of items that get a staggered reveal (spec §6.1: 25ms × ≤ 6 items) */
  staggeredAnimationLimit: 6,
} as const

/**
 * One row of the work log: 28px, 13px label, secondary text. Rows sit in a flex wrapper; the
 * hover fill bleeds 6px past the text edge (-ml-1.5 + flex-1) so icons stay on the column of
 * the summary chevron.
 */
export const WORK_LOG_ROW =
  'flex min-h-7 in-data-compact:min-h-9 min-w-0 flex-1 -ml-1.5 items-center gap-2 rounded-sm px-1.5 py-0.5 text-left text-label text-secondary'

/** Wrapper of one row: hosts the depth indent and the insert animation. */
export const WORK_LOG_ROW_WRAPPER = 'flex min-w-0'

/** Clickable rows: hover-in instant, hover-out 100ms; the focus ring is drawn inside the clipping list. */
export const WORK_LOG_ROW_INTERACTIVE =
  'transition-colors duration-micro ease-out-subtle hover:bg-fill-hover hover:duration-instant active:bg-fill-pressed focus-visible:-outline-offset-2'

/** 16px slot that holds a row's leading icon so every row's text starts on the same column. */
export const ROW_ICON_SLOT = 'flex size-4 shrink-0 items-center justify-center'

/**
 * The expanded work log body: an inset hairline under the summary chevron (spec §7.4).
 * ml-1.75 (7px) centres the hairline under the 14px chevron.
 */
export const WORK_LOG_BODY = 'ml-1.75 flex min-w-0 flex-col border-l border-default pl-3.5'

/**
 * Insert animation for rows created after the card mounted: 150ms fade + 4px drop, driven by
 * @starting-style so an element animates exactly once — when it is inserted — and never on a
 * re-render or a streamed token. The distance scales with --motion-scale (0 under reduced
 * motion, leaving the fade). Put it on a wrapper so it doesn't fight a row's color transition.
 */
export const INSERT_DROP =
  'transition-[opacity,translate] duration-fast ease-out starting:opacity-0 starting:[translate:0_calc(-4px*var(--motion-scale))]'

/** Stagger for the first rows of a reveal (25ms × ≤ 6 items, spec §6.1). */
export function revealDelay(index: number): React.CSSProperties | undefined {
  if (index <= 0) return undefined
  return { transitionDelay: `calc(var(--stagger) * ${Math.min(index, SIZE_CONFIG.staggeredAnimationLimit - 1)})` }
}

/** Status chips: 20px, radius-xs, label-sm (kit .chip). */
export const CHIP_DESTRUCTIVE =
  'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-xs bg-destructive-tint px-1.5 text-label-sm text-destructive'
export const CHIP_NEUTRAL =
  'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-xs bg-fill-hover px-1.5 text-label-sm text-secondary'

/**
 * Answer typography (spec §7.4 "Answer", mockup `.answer`): copy 15/24 (16/26 in the compact
 * shell), blocks 12px apart, flush first/last block, inline code 14px in the compact shell.
 * Scoped to the answer so other Markdown hosts keep their own rhythm.
 */
export const ANSWER_PROSE = [
  'text-copy text-foreground in-data-compact:text-copy-lg',
  '[&_.markdown-content_p]:my-3 [&_.markdown-content_p]:leading-[inherit]',
  '[&_.markdown-content>:first-child]:mt-0 [&_.markdown-content>:last-child]:mb-0',
  'in-data-compact:[&_.inline-code]:text-label-lg',
].join(' ')

/**
 * New answer blocks fade in once while streaming (150ms, ≤ 4px rise, spec §6.4). Only applied
 * while the response streams: a block that already exists never re-animates, and text inside a
 * block never animates per token.
 */
export const ANSWER_BLOCK_IN =
  '[&_.markdown-content>*]:transition-[opacity,translate] [&_.markdown-content>*]:duration-fast [&_.markdown-content>*]:ease-out [&_.markdown-content>*]:starting:opacity-0 [&_.markdown-content>*]:starting:[translate:0_calc(4px*var(--motion-scale))]'

/**
 * Quiet action rows (answer footer, header ⋯): revealed on hover/focus with opacity only —
 * hover-in instant, hover-out 100ms — and kept visible while one of their menus is open.
 * Devices without hover (phones/tablets: viewer, WebUI) always show them; `data-touch-reveal`
 * (set by the caller) also keeps them visible in the app's compact shell.
 */
export const HOVER_REVEAL =
  'opacity-0 transition-opacity duration-micro ease-out-subtle focus-within:opacity-100 has-[[data-state=open]]:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100'
