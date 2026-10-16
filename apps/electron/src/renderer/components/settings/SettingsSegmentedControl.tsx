/**
 * SettingsSegmentedControl
 *
 * Horizontal button group for selecting between options.
 * Ideal for theme selection, font selection, etc.
 *
 * Same material as the Tabs primitive (mockup `.seg`): a neutral well with the selected
 * item raised. It keeps radio semantics (role=radiogroup) — selection happens on click.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SettingsSegmentedOption<T extends string = string> {
  /** Value for this option */
  value: T
  /** Display label */
  label: string
  /** Optional icon */
  icon?: React.ReactNode
}

export interface SettingsSegmentedControlProps<T extends string = string> {
  /** Currently selected value */
  value: T
  /** Change handler */
  onValueChange: (value: T) => void
  /** Available options */
  options: SettingsSegmentedOption<T>[]
  /** Size variant */
  size?: 'sm' | 'md'
  /** Additional className */
  className?: string
  /** Accessible name for the group */
  'aria-label'?: string
}

/**
 * SettingsSegmentedControl - Horizontal button group
 *
 * @example
 * <SettingsSegmentedControl
 *   value={theme}
 *   onValueChange={setTheme}
 *   options={[
 *     { value: 'system', label: 'System', icon: <Monitor /> },
 *     { value: 'light', label: 'Light', icon: <Sun /> },
 *     { value: 'dark', label: 'Dark', icon: <Moon /> },
 *   ]}
 * />
 */
export function SettingsSegmentedControl<T extends string = string>({
  value,
  onValueChange,
  options,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: SettingsSegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 rounded-md bg-fill-hover p-0.5',
        className
      )}
    >
      {options.map((option) => {
        const isSelected = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'motion-press inline-flex h-control-sm in-data-compact:h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium',
              'text-label-sm [&_svg]:size-3.5 [&_svg]:shrink-0',
              size === 'sm' ? 'px-2' : 'px-2.5',
              isSelected
                ? 'bg-floating text-foreground shadow-elev-1'
                : 'text-secondary hover:text-foreground'
            )}
          >
            {option.icon && (
              <span className="inline-flex shrink-0" aria-hidden>
                {option.icon}
              </span>
            )}
            <span className="truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * SettingsSegmentedControlCard - Card variant with individual backgrounds
 *
 * Each option is a small card (like Amie's app icon selector)
 */
export interface SettingsSegmentedCardOption<T extends string = string> {
  value: T
  label: string
  icon?: React.ReactNode
}

export interface SettingsSegmentedControlCardProps<T extends string = string> {
  value: T
  onValueChange: (value: T) => void
  options: SettingsSegmentedCardOption<T>[]
  /** Number of columns */
  columns?: 2 | 3 | 4
  className?: string
}

export function SettingsSegmentedControlCard<T extends string = string>({
  value,
  onValueChange,
  options,
  columns = 3,
  className,
}: SettingsSegmentedControlCardProps<T>) {
  return (
    <div
      role="radiogroup"
      className={cn(
        'grid gap-2',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-3',
        columns === 4 && 'grid-cols-4',
        className
      )}
    >
      {options.map((option) => {
        const isSelected = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'motion-press flex items-center gap-2 rounded-lg px-3 py-2.5 text-left',
              isSelected
                ? 'bg-fill-selected inset-ring-2 inset-ring-accent-solid'
                : 'inset-ring inset-ring-border hover:bg-fill-hover'
            )}
          >
            {/* Radio indicator: --border-control off ring (≥ 3:1), accent when on */}
            <span
              aria-hidden
              className={cn(
                'grid size-4 shrink-0 place-items-center rounded-full',
                isSelected ? 'bg-accent-solid' : 'inset-ring-[1.5px] inset-ring-[var(--border-control)]'
              )}
            >
              {isSelected && <span className="size-1.5 rounded-full bg-on-accent" />}
            </span>

            {/* Label */}
            <span className="text-label">{option.label}</span>

            {/* Icon on right */}
            {option.icon && (
              <span className="ml-auto shrink-0">{option.icon}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
