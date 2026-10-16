/**
 * SettingsPage
 *
 * Detail-column layout shared by every settings page (design spec §7.12, mockup `.detail .inner`):
 * a header row for the page actions, then a centred 680px column (28px side padding, 16px when the
 * panel is narrower than the 768px compact breakpoint) holding the page title, a one-line lede and
 * the setting groups. The title lives in the column, so the panel header carries actions only.
 */

import * as React from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

/** Centred detail column: 680px max, 28px sides (16px in a compact panel). */
export const DETAIL_COLUMN_CLASS =
  'mx-auto w-full max-w-[680px] px-7 pt-2 pb-12 @max-mobile/panel:px-4 @max-mobile/panel:pb-10'

export interface SettingsPageProps {
  /** Page title (20/28 600), rendered at the top of the column */
  title: string
  /** One-line lede under the title */
  description?: React.ReactNode
  /** Header actions (e.g. the ⋯ HeaderMenu) */
  actions?: React.ReactNode
  /** Setting groups */
  children: React.ReactNode
  /** Extra classes for the groups stack */
  className?: string
}

/** Page title + lede at the top of a detail column. */
export function SettingsPageTitle({
  title,
  description,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mt-2 mb-5', className)}>
      <h2 className="text-title text-foreground">{title}</h2>
      {description && (
        <p className="mt-1 text-label leading-5 text-secondary">{description}</p>
      )}
    </div>
  )
}

export function SettingsPage({ title, description, actions, children, className }: SettingsPageProps) {
  return (
    <div className="h-full flex flex-col">
      <PanelHeader actions={actions} />
      {/* No edge mask: the column starts 16px under the header and a fade would dim the title. */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className={DETAIL_COLUMN_CLASS}>
            <SettingsPageTitle title={title} description={description} />
            <div className={cn('space-y-6', className)}>{children}</div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

/** Centred placeholder (loading spinner, empty message) under a settings header. */
export function SettingsPageState({
  actions,
  children,
}: {
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="h-full flex flex-col">
      <PanelHeader actions={actions} />
      <div className="flex-1 flex items-center justify-center px-4 text-label text-tertiary">
        {children}
      </div>
    </div>
  )
}
