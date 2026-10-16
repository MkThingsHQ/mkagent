/**
 * Info_Section
 *
 * Section container with title, optional description, and content card.
 * Matches SettingsSection styling (mockup `.group > h3`, `.ghint`, `.card`).
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface Info_SectionProps {
  /** Section title */
  title: string
  /** Optional item count shown next to the title (tertiary, tabular) */
  count?: number
  /** Optional description below title */
  description?: string
  /** Optional right-aligned header actions */
  actions?: React.ReactNode
  /** Section content */
  children: React.ReactNode
  className?: string
}

export function Info_Section({
  title,
  count,
  description,
  actions,
  children,
  className,
}: Info_SectionProps) {
  return (
    <section className={cn('space-y-2', className)}>
      {/* Same header as SettingsSection: a quiet label (metadata, a step below the rows it heads);
          actions centre on a one-line header and bottom-align with a description. */}
      <div className={cn('flex justify-between gap-4', description ? 'items-end' : 'items-center')}>
        <div className="min-w-0 space-y-1">
          <h3 className="text-label-sm font-semibold text-secondary">
            {title}
            {count !== undefined && (
              <span className="ml-1.5 text-label-sm font-normal text-tertiary tabular-nums">{count}</span>
            )}
          </h3>
          {description && (
            <p className="text-label-sm text-tertiary">{description}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className="overflow-hidden rounded-lg bg-raised shadow-elev-1">
        {children}
      </div>
    </section>
  )
}
