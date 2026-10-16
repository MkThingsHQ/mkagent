/**
 * ThemeGrid
 *
 * Color-theme picker as a grid of tiles with live swatches (design spec §7.12, mockup
 * `.theme-grid` / `.theme-tile`): each tile shows the theme's navigator strip, paper, a primary
 * and a tertiary ink line and its accent, all solved by the same role engine that paints the app
 * (`deriveThemeRoles`), in the ACTIVE mode — dark previews in dark mode. Dark-only and scenic
 * themes always preview dark, like they render. Selecting a tile calls `onValueChange` with the
 * same value the old dropdown used.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  DEFAULT_THEME,
  resolveTheme,
  resolveThemeRoleInput,
  type ThemeFile,
  type ThemeOverrides,
} from '@config/theme'
import { backgroundIsDark, deriveThemeRoles } from '@config/theme-roles'

export interface ThemeGridOption {
  /** Value passed to onValueChange ('default' for the built-in theme) */
  value: string
  /** Tile caption */
  label: string
  /** Theme data; omit for the built-in default theme */
  theme?: ThemeFile
}

export interface ThemeGridProps {
  value: string
  onValueChange: (value: string) => void
  options: ThemeGridOption[]
  /** The app's resolved mode — previews follow it */
  mode: 'light' | 'dark'
  /** ~/.mkagent/theme.json overrides, layered on every preset like the app does */
  overrides?: ThemeOverrides | null
  /** Caption shown on dark-only themes */
  darkOnlyLabel: string
  /** Accessible name for the group */
  'aria-label'?: string
  /** Empty tiles that hold the grid's rows while the options are still loading (no layout shift) */
  placeholderCount?: number
  className?: string
}

interface Swatch {
  navigator: string
  paper: string
  text: string
  tertiary: string
  accent: string
}

function isDarkOnly(theme: ThemeFile | undefined): boolean {
  const modes = theme?.supportedModes
  return !!modes && modes.length === 1 && modes[0] === 'dark'
}

/** Solve the roles a theme would get in `mode`, exactly like ThemeContext → themeToCSS. */
function solveSwatch(theme: ThemeFile | undefined, mode: 'light' | 'dark', overrides?: ThemeOverrides | null): Swatch | null {
  try {
    // Same resolution as ThemeContext (resolveTheme(null, overrides) for the default theme), so a theme.json
    // with only top-level colors previews those colors in dark mode too
    const resolved = resolveTheme(theme ?? null, overrides)
    const scenic = resolved.mode === 'scenic' && !!resolved.backgroundImage
    const dark = mode === 'dark' || isDarkOnly(theme) || scenic
    const input = resolveThemeRoleInput(resolved, dark)
    const { vars } = deriveThemeRoles(input, backgroundIsDark(input.background) ? 'dark' : 'light')
    return {
      navigator: vars['--surface-navigator'],
      paper: vars['--surface-paper'],
      text: vars['--text'],
      tertiary: vars['--text-tertiary'],
      accent: vars['--accent-solid'],
    }
  } catch {
    // An unparseable theme still gets a tile, just without a preview
    return null
  }
}

function ThemeSwatch({ swatch }: { swatch: Swatch | null }) {
  if (!swatch) {
    return <span aria-hidden className="block h-[54px] rounded-sm bg-fill-hover" />
  }
  return (
    <span
      aria-hidden
      className="relative flex h-[54px] overflow-hidden rounded-sm"
      style={{ background: swatch.paper }}
    >
      <span className="h-full basis-[30%]" style={{ background: swatch.navigator }} />
      <span className="absolute left-[36%] right-[10%] top-3.5 h-1 rounded-full" style={{ background: swatch.text }} />
      <span className="absolute left-[36%] right-[30%] top-6 h-1 rounded-full" style={{ background: swatch.tertiary }} />
      <span className="absolute left-[36%] top-[38px] size-2 rounded-full" style={{ background: swatch.accent }} />
    </span>
  )
}

export function ThemeGrid({
  value,
  onValueChange,
  options,
  mode,
  overrides,
  darkOnlyLabel,
  'aria-label': ariaLabel,
  placeholderCount = 0,
  className,
}: ThemeGridProps) {
  const swatches = React.useMemo(
    () => options.map((option) => solveSwatch(option.theme, mode, overrides)),
    [options, mode, overrides]
  )

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2.5', className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'flex min-w-0 flex-col gap-1.5 rounded-lg p-1.5 text-left',
              'transition-colors duration-micro ease-out-subtle hover:bg-fill-hover hover:duration-instant',
              selected ? 'inset-ring-2 inset-ring-accent-solid' : 'inset-ring inset-ring-border'
            )}
          >
            <ThemeSwatch swatch={swatches[index]} />
            <span className="flex items-baseline justify-between gap-2 px-0.5 pb-0.5 text-label-sm font-medium text-foreground">
              <span className="truncate">{option.label}</span>
              {isDarkOnly(option.theme) && (
                <span className="shrink-0 font-normal text-tertiary">{darkOnlyLabel}</span>
              )}
            </span>
          </button>
        )
      })}
      {Array.from({ length: placeholderCount }, (_, index) => (
        <div key={`placeholder-${index}`} aria-hidden className="flex min-w-0 flex-col gap-1.5 rounded-lg p-1.5 inset-ring inset-ring-border">
          <ThemeSwatch swatch={null} />
          <span className="px-0.5 pb-0.5 text-label-sm">&nbsp;</span>
        </div>
      ))}
    </div>
  )
}
