import * as React from 'react'
import { MotionConfig } from 'motion/react'

/** The user's Motion setting (Settings › Appearance). */
export type MotionPreference = 'system' | 'reduced' | 'full'

export const MOTION_PREFERENCES: readonly MotionPreference[] = ['system', 'reduced', 'full']

const REDUCED_MOTION = { system: 'user', reduced: 'always', full: 'never' } as const

/**
 * Applies the Motion setting to both motion systems:
 * - motion/react via `<MotionConfig reducedMotion>` (transforms/layout off, opacity kept);
 * - CSS via `<html data-motion>`, which tokens.css reads next to `prefers-reduced-motion`
 *   (--motion-scale: 0 collapses every distance; crossfades stay).
 * Mount once at each app root.
 */
export function MotionPreferenceProvider({
  preference = 'system',
  children,
}: {
  preference?: MotionPreference
  children: React.ReactNode
}) {
  React.useEffect(() => {
    const root = document.documentElement
    if (preference === 'system') delete root.dataset.motion
    else root.dataset.motion = preference
    return () => {
      delete root.dataset.motion
    }
  }, [preference])

  return <MotionConfig reducedMotion={REDUCED_MOTION[preference]}>{children}</MotionConfig>
}

export function isMotionPreference(value: unknown): value is MotionPreference {
  return typeof value === 'string' && (MOTION_PREFERENCES as readonly string[]).includes(value)
}
