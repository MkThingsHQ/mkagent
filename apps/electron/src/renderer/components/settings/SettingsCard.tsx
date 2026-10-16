/**
 * SettingsCard
 *
 * Raised card for grouping related settings (design spec §7.12: raised material,
 * radius 12, elev-1). Children are separated by full-width hairlines.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { settingsUI } from './SettingsUIConstants'

export interface SettingsCardProps {
  /** Card content */
  children: React.ReactNode
  /** Additional className */
  className?: string
  /** Whether to add internal dividers between children */
  divided?: boolean
}

/** 1px hairline between rows inside a card. */
export function SettingsCardDivider({ className }: { className?: string }) {
  return <div aria-hidden className={cn('h-px bg-separator', className)} />
}

/**
 * SettingsCard - Container for grouping related settings
 *
 * @example
 * <SettingsCard>
 *   <SettingsToggle label="Option 1" ... />
 *   <SettingsToggle label="Option 2" ... />
 * </SettingsCard>
 */
export function SettingsCard({ children, className, divided = true }: SettingsCardProps) {
  const childArray = React.Children.toArray(children).filter(Boolean)

  return (
    <div
      className={cn(
        'rounded-lg bg-raised shadow-elev-1 overflow-hidden',
        className
      )}
    >
      {divided && childArray.length > 1
        ? childArray.map((child, index) => (
            <React.Fragment key={index}>
              {index > 0 && <SettingsCardDivider />}
              {child}
            </React.Fragment>
          ))
        : children}
    </div>
  )
}

/**
 * SettingsCardContent - Inner padding wrapper for card content
 *
 * Use when you need custom content inside a SettingsCard
 */
export function SettingsCardContent({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn(settingsUI.cardPadding, className)}>{children}</div>
}

/**
 * SettingsCardFooter - Footer section with actions.
 * Inside a SettingsCard the card's own hairline separates it from the rows above.
 */
export function SettingsCardFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 px-3.5 py-2.5',
        className
      )}
    >
      {children}
    </div>
  )
}
