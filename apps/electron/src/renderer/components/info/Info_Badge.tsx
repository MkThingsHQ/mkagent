/**
 * Info_Badge
 *
 * Chip (mockup `.chip`): 20px, radius 4, 12px label. Status colors use the solved role tints
 * (text stays ≥ 4.5:1 on its own tint); neutral chips use the hover fill.
 * `dot` adds a 6px dot in the chip's color so status never relies on color alone with text.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export type BadgeColor = 'success' | 'warning' | 'destructive' | 'default' | 'muted'

export interface Info_BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Badge color variant */
  color?: BadgeColor
  /** Optional icon (renders before text) */
  icon?: React.ReactNode
  /** Show a leading status dot in the chip's color */
  dot?: boolean
  /** Badge text */
  children: React.ReactNode
}

const colorClasses: Record<BadgeColor, string> = {
  success: 'bg-success-tint text-success',
  warning: 'bg-info-tint text-info',
  destructive: 'bg-destructive-tint text-destructive',
  default: 'bg-fill-hover text-secondary',
  /** Code-like values (tool names, patterns, commands): outlined, no fill */
  muted: 'text-secondary inset-ring inset-ring-border',
}

export function Info_Badge({
  color = 'default',
  icon,
  dot,
  children,
  className,
  ...props
}: Info_BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full items-center gap-1 whitespace-nowrap rounded-xs px-1.5 text-label-sm font-medium',
        colorClasses[color],
        className
      )}
      {...props}
    >
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
      {icon && <span className="shrink-0 [&_svg]:size-3">{icon}</span>}
      {children}
    </span>
  )
}
