import type { PermissionMode } from '@mkagent/shared/agent/modes'

/**
 * Shared composer materials (design spec §7.5, mockup `.composer` / `.cx-bar`).
 * Role utilities only — no palette colors, literal shadows or durations.
 */

/**
 * Toolbar chip (mockup `.cx-bar .chip-btn`): 28px ghost pill, secondary label, tertiary icon.
 * `input-toolbar-btn` is the compact hook in index.css (36px targets ≤ 768px).
 * `motion-press`: hover-in instant, hover-out 100ms, press .97.
 */
export const COMPOSER_CHIP = [
  'input-toolbar-btn motion-press inline-flex h-control min-w-0 items-center gap-1.5 rounded-full px-2',
  'text-label font-medium text-secondary select-none',
  'hover:bg-fill-hover hover:text-foreground data-[state=open]:bg-fill-hover data-[state=open]:text-foreground',
  'disabled:pointer-events-none disabled:text-disabled',
  "[&_svg:not([class*='text-'])]:text-tertiary",
].join(' ')

/**
 * Permission-mode chip tones: Explore neutral, Ask "needs you" amber, Guarded success,
 * Execute accent. Text roles are contrast-solved on their own tints.
 */
export const MODE_CHIP_TONE: Record<PermissionMode, string> = {
  safe: 'bg-fill-hover text-secondary',
  ask: 'bg-info-tint text-info',
  'allow-all': 'bg-accent-tint text-accent',
}

/** Icon tone for the same modes when shown on a neutral row (menus, drawers). */
export const MODE_ICON_TONE: Record<PermissionMode, string> = {
  safe: 'text-secondary',
  ask: 'text-info',
  'allow-all': 'text-accent',
}

/** A mode this build does not know (newer server) is shown as Ask, matching the selectors. */
export function knownMode(mode: PermissionMode): PermissionMode {
  return Object.hasOwn(MODE_CHIP_TONE, mode) ? mode : 'ask'
}

/**
 * Quiet metadata chip for the row above the composer (status, labels, Info, background tasks):
 * 24px, opaque raised fill + hairline so stacked chips never show through each other.
 */
export const COMPOSER_META_CHIP = [
  'motion-press state-overlay inline-flex h-control-sm shrink-0 items-center gap-1.5 rounded-full px-2.5',
  'bg-raised text-label-sm font-medium text-secondary ring-1 ring-inset ring-border select-none',
  'data-[state=open]:text-foreground',
].join(' ')
