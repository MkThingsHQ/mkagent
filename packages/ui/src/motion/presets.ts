/**
 * Motion presets for `motion/react` — the TypeScript mirror of the motion tokens in
 * packages/ui/src/styles/tokens.css (design spec §6).
 *
 * Rules:
 * - Animate transform and opacity only; layout changes happen once and are smoothed with FLIP.
 * - Springs for spatial, interruptible motion; tweens for opacity and color.
 * - Always pass `bounce` with `visualDuration`: motion 12 silently turns `visualDuration` alone
 *   into a 100/10 spring with ~16% overshoot.
 * - Keyboard and high-frequency actions are INSTANT.
 *
 *   import { SPRING, TWEEN } from '@mkagent/ui/motion'
 *   <motion.div animate={{ x: 0 }} transition={SPRING.panel} />
 *   <motion.div animate={{ opacity: 1 }} transition={TWEEN.fast} />
 */
import type { Transition } from 'motion/react'

/** Durations in seconds (motion's unit). CSS: --dur-*. */
export const DURATION = {
  instant: 0,
  /** color, press, hover-out, menu exit */
  micro: 0.1,
  /** menus, popovers, tooltips, block insert */
  fast: 0.15,
  /** dialogs, expand in place, toasts */
  base: 0.2,
  /** panels, shared elements — the UI maximum */
  slow: 0.3,
  exit: 0.1,
} as const

/** Cubic-bézier easings. CSS: --ease-*. */
export const EASE = {
  /** entering, responding */
  out: [0.23, 1, 0.32, 1],
  /** menus, hover-out */
  outSubtle: [0.25, 0.46, 0.45, 0.94],
  /** on-screen moves */
  standard: [0.4, 0, 0.2, 1],
  /** off-screen exits */
  exit: [0.4, 0, 1, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>

/** Named springs. All critically damped except `gentle` (~0 overshoot) and `gesture` (keeps velocity). */
export const SPRING = {
  /** toggles, chips, check marks, drop settle — 1218/70, 95% at 136ms */
  snap: { type: 'spring', visualDuration: 0.15, bounce: 0 },
  /** expand in place, list FLIP, toasts — 566/48, 95% at 200ms */
  base: { type: 'spring', visualDuration: 0.22, bounce: 0 },
  /** sidebar and panels, composer dock — 350/37, 95% at 254ms */
  panel: { type: 'spring', visualDuration: 0.28, bounce: 0 },
  /** rare large surfaces (onboarding, Island) — 268/30 */
  gentle: { type: 'spring', visualDuration: 0.32, bounce: 0.08 },
  /** release after a drag or flick — 380/31, 1.6% overshoot */
  gesture: { type: 'spring', stiffness: 380, damping: 31 },
} as const satisfies Record<string, Transition>

/** Tweens for opacity and color. */
export const TWEEN = {
  micro: { type: 'tween', duration: DURATION.micro, ease: EASE.outSubtle },
  fast: { type: 'tween', duration: DURATION.fast, ease: EASE.out },
  base: { type: 'tween', duration: DURATION.base, ease: EASE.out },
  exit: { type: 'tween', duration: DURATION.exit, ease: EASE.exit },
} as const satisfies Record<string, Transition>

/** For keyboard-initiated and high-frequency changes (⌘K, J/K, session switch, ⌘B). */
export const INSTANT = { duration: 0 } as const satisfies Transition

export type SpringPreset = (typeof SPRING)[keyof typeof SPRING]

/** Stiffness/damping of a preset — the same formula motion-dom uses for `visualDuration` + `bounce`. */
export function springParams(spring: SpringPreset): { stiffness: number; damping: number; mass: number } {
  if ('stiffness' in spring) return { stiffness: spring.stiffness, damping: spring.damping, mass: 1 }
  const root = (2 * Math.PI) / (spring.visualDuration * 1.2)
  const stiffness = root * root
  return { stiffness, damping: 2 * Math.min(1, Math.max(0.05, 1 - spring.bounce)) * Math.sqrt(stiffness), mass: 1 }
}

function springPosition({ stiffness: k, damping: d, mass: m }: { stiffness: number; damping: number; mass: number }) {
  const w0 = Math.sqrt(k / m)
  const z = d / (2 * Math.sqrt(k * m))
  if (Math.abs(z - 1) < 1e-6) return (t: number) => 1 - Math.exp(-w0 * t) * (1 + w0 * t)
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z)
    return (t: number) => 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t))
  }
  const r = Math.sqrt(z * z - 1)
  const s1 = -w0 * (z - r)
  const s2 = -w0 * (z + r)
  return (t: number) => 1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1)
}

/**
 * A spring as a CSS `linear()` easing plus the time it takes to settle within 0.1%, so CSS-only
 * surfaces run the same curve motion/react would. Generates the --spring-* tokens in tokens.css.
 */
export function springToCss(spring: SpringPreset, samples = 48): { easing: string; durationMs: number } {
  const x = springPosition(springParams(spring))
  let settle = 0
  for (let t = 0; t < 3; t += 0.002) if (Math.abs(1 - x(t)) > 0.001) settle = t
  settle = Math.max(0.05, settle + 0.002)
  const points: number[] = []
  for (let i = 0; i <= samples; i++) points.push(+x((settle * i) / samples).toFixed(4))
  points[points.length - 1] = 1
  return { easing: `linear(${points.join(', ')})`, durationMs: Math.round(settle * 1000) }
}
