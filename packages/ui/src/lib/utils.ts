/**
 * Utility functions for @mkagent/ui
 */

import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Design-token scales from styles/tokens.css that tailwind-merge must know about. Without them it
 * reads `text-label` as a text COLOR and silently drops it next to `text-secondary` (or drops the
 * color), and never resolves `h-control` against `h-7`. Kept in sync by lib/__tests__/utils.test.ts.
 */
export const TOKEN_SCALES = {
  text: ['caption', 'label-sm', 'label', 'label-lg', 'copy', 'copy-lg', 'title', 'display', 'mono-ui'],
  shadow: ['elev-0', 'elev-1', 'elev-2', 'elev-3'],
  spacing: ['control-sm', 'control', 'control-lg', 'control-xl', 'row-sidebar', 'row-menu', 'row-list', 'row-list-2', 'row-touch', 'gutter', 'row-inset', 'card-pad'],
  ease: ['out-subtle', 'standard', 'exit'],
  duration: ['instant', 'micro', 'fast', 'base', 'slow', 'exit'],
} as const

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [...TOKEN_SCALES.text],
      shadow: [...TOKEN_SCALES.shadow],
      spacing: [...TOKEN_SCALES.spacing],
      ease: [...TOKEN_SCALES.ease],
    },
    classGroups: {
      duration: [{ duration: [...TOKEN_SCALES.duration] }],
    },
  },
})

/**
 * Merge class names with Tailwind CSS conflict resolution (aware of the design-token scales)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
