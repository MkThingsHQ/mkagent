/**
 * FLIP (First, Last, Invert, Play) for layout changes that commit once — sidebar and list collapse,
 * expand-in-place, list regroup (design spec §6.1 rule 6, §6.3).
 *
 * The layout changes in a single commit; each element is then moved back to where it was with a
 * transform and animated home on a spring, played as its CSS `linear()` curve through the Web
 * Animations API. Transform only, so the browser does no layout while it runs.
 *
 *   const before = snapshotRects(els)      // before the DOM changes (getSnapshotBeforeUpdate, or before a mutation)
 *   mutate()
 *   playFlip(before, [{ el: panel }, { el: panelMaterial, mode: 'scale' }])
 *
 * Modes:
 * - `translate` (default): the element slides from its old position; its size snaps.
 * - `scale`: the element only scales (from its top-left) so its painted box tracks old → new size. Use it on
 *   a content-less material layer (a card background) whose parent is translated — content never scales.
 * - `rect`: translate + scale, for content-less elements that move and resize on their own.
 *
 * Under reduced motion (`<html data-motion="reduced">`, or the OS setting unless `data-motion="full"`) nothing
 * animates — the layout change is the whole transition.
 */
import { EASE, DURATION, SPRING, springToCss, type SpringPreset } from './presets'

export type FlipMode = 'translate' | 'scale' | 'rect'
export type FlipAxis = 'x' | 'y' | 'both'

export interface FlipTarget {
  el: HTMLElement
  mode?: FlipMode
}

export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

/** Rects keyed by element, measured before the layout change. */
export type FlipSnapshot = Map<HTMLElement, RectLike>

/** Animation id so a new FLIP can cancel an unfinished one on the same element. */
export const FLIP_ANIMATION_ID = 'ca-flip'

/** Below these deltas an element is considered unmoved and is not animated. */
const MIN_DELTA_PX = 0.5
const MIN_SCALE_DELTA = 0.002

export function snapshotRects(elements: Iterable<HTMLElement | null | undefined>): FlipSnapshot {
  const snapshot: FlipSnapshot = new Map()
  for (const el of elements) {
    if (!el) continue
    const r = el.getBoundingClientRect()
    snapshot.set(el, { left: r.left, top: r.top, width: r.width, height: r.height })
  }
  return snapshot
}

/**
 * The transform that puts an element laid out at `after` back where it was at `before`, or null when the
 * difference is too small to animate. Pure, so it is unit-tested without a DOM.
 */
export function flipTransform(before: RectLike, after: RectLike, mode: FlipMode = 'translate', axis: FlipAxis = 'both'): string | null {
  const useX = axis !== 'y'
  const useY = axis !== 'x'
  const dx = mode !== 'scale' && useX ? before.left - after.left : 0
  const dy = mode !== 'scale' && useY ? before.top - after.top : 0
  const sx = mode !== 'translate' && useX && after.width > 0 ? before.width / after.width : 1
  const sy = mode !== 'translate' && useY && after.height > 0 ? before.height / after.height : 1
  const moved = Math.abs(dx) >= MIN_DELTA_PX || Math.abs(dy) >= MIN_DELTA_PX
  const scaled = Math.abs(sx - 1) >= MIN_SCALE_DELTA || Math.abs(sy - 1) >= MIN_SCALE_DELTA
  if (!moved && !scaled) return null
  const parts: string[] = []
  if (moved) parts.push(`translate(${round(dx)}px, ${round(dy)}px)`)
  if (scaled) parts.push(`scale(${round(sx, 4)}, ${round(sy, 4)})`)
  return parts.join(' ')
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** The user's Motion setting, as the CSS tokens see it (tokens.css reduced-motion block). */
export function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return true
  const pref = document.documentElement.dataset.motion
  if (pref === 'reduced') return true
  if (pref === 'full') return false
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

const curveCache = new Map<SpringPreset, { easing: string; duration: number }>()
let linearEasingSupported: boolean | undefined

/** A spring preset as WAAPI timing; falls back to the standard ease where `linear()` easing is unsupported. */
export function springTiming(spring: SpringPreset): { easing: string; duration: number } {
  const cached = curveCache.get(spring)
  if (cached) return cached
  if (linearEasingSupported === undefined) {
    linearEasingSupported = typeof CSS !== 'undefined' && !!CSS.supports?.('animation-timing-function', 'linear(0, 1)')
  }
  const { easing, durationMs } = springToCss(spring)
  const timing = linearEasingSupported
    ? { easing, duration: durationMs }
    : { easing: `cubic-bezier(${EASE.standard.join(', ')})`, duration: DURATION.slow * 1000 }
  curveCache.set(spring, timing)
  return timing
}

/** Cancel unfinished FLIP animations on these elements (call before measuring the new layout). */
export function cancelFlip(elements: Iterable<HTMLElement | null | undefined>): void {
  for (const el of elements) {
    if (!el?.getAnimations) continue
    for (const animation of el.getAnimations()) {
      if (animation.id === FLIP_ANIMATION_ID) animation.cancel()
    }
  }
}

export interface PlayFlipOptions {
  spring?: SpringPreset
  axis?: FlipAxis
}

/**
 * Animate each target from its snapshot rect to where it is now. Measures every target first, then starts
 * every animation, so starting one animation can't skew another's measurement. Returns the animations
 * (empty under reduced motion).
 */
export function playFlip(before: FlipSnapshot, targets: FlipTarget[], { spring = SPRING.panel, axis = 'both' }: PlayFlipOptions = {}): Animation[] {
  if (prefersReducedMotion() || targets.length === 0) return []
  const plans: Array<{ el: HTMLElement; from: string }> = []
  for (const { el, mode = 'translate' } of targets) {
    const was = before.get(el)
    if (!was || !el.isConnected) continue
    const r = el.getBoundingClientRect()
    const from = flipTransform(was, { left: r.left, top: r.top, width: r.width, height: r.height }, mode, axis)
    if (from) plans.push({ el, from })
  }
  const { easing, duration } = springTiming(spring)
  return plans.map(({ el, from }) => {
    const animation = el.animate(
      [
        { transform: from, transformOrigin: '0 0' },
        { transform: 'none', transformOrigin: '0 0' },
      ],
      { duration, easing },
    )
    animation.id = FLIP_ANIMATION_ID
    return animation
  })
}

/** Animation id for exit slides, so an entrance can be told apart from an exit it interrupts. */
export const SLIDE_OUT_ANIMATION_ID = 'ca-slide-out'

/**
 * Slide an element along x from `fromX` px to its laid-out position (entrance, `toX` 0) or from its position
 * out to `toX` (exit; holds the end state until the caller cancels it). Returns null under reduced motion.
 */
export function playSlideX(el: HTMLElement, fromX: number, toX: number, spring: SpringPreset = SPRING.panel): Animation | null {
  if (prefersReducedMotion() || !el.isConnected) return null
  const { easing, duration } = springTiming(spring)
  const exit = toX !== 0
  const animation = el.animate(
    [{ transform: `translateX(${round(fromX)}px)` }, { transform: exit ? `translateX(${round(toX)}px)` : 'none' }],
    { duration, easing, fill: exit ? 'forwards' : 'none' },
  )
  animation.id = exit ? SLIDE_OUT_ANIMATION_ID : FLIP_ANIMATION_ID
  return animation
}

/** Cancel unfinished exit slides (e.g. the element was shown again mid-exit). */
export function cancelSlideOut(elements: Iterable<HTMLElement | null | undefined>): void {
  for (const el of elements) {
    if (!el?.getAnimations) continue
    for (const animation of el.getAnimations()) {
      if (animation.id === SLIDE_OUT_ANIMATION_ID) animation.cancel()
    }
  }
}
