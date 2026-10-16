/**
 * Info_Page
 *
 * Compound page layout component for Info pages.
 * Handles loading, error, and empty states with consistent styling.
 *
 * Detail pages share the settings column (design spec §7.11/§7.12): a 680px centred column with a
 * hero (36px mark tile, 20/28 title, a meta line) followed by groups of raised cards.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'lucide-react'
import { PanelHeader, type PanelHeaderProps } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@mkagent/ui'
import { cn } from '@/lib/utils'
import { DETAIL_COLUMN_CLASS } from '@/components/settings/SettingsPage'

export interface Info_PageProps {
  children: React.ReactNode
  /** Show loading spinner */
  loading?: boolean
  /** Show error state with message */
  error?: string
  /** Show empty state with message */
  empty?: string
  className?: string
}

export interface Info_PageHeaderProps extends Omit<PanelHeaderProps, 'className'> {
  className?: string
}

export interface Info_PageHeroProps {
  /** Avatar element (rendered in a 36px tile with a hairline ring) */
  avatar: React.ReactNode
  /** Title displayed next to avatar */
  title?: string
  /** Tagline/description text below title */
  tagline?: string | null
  /** Optional leading items on the meta line (e.g. a state pill), before the tagline */
  meta?: React.ReactNode
  /** Optional actions on the right (e.g. Edit) */
  actions?: React.ReactNode
  className?: string
}

export interface Info_PageContentProps {
  children: React.ReactNode
  className?: string
}

function Info_PageRoot({
  children,
  loading,
  error,
  empty,
  className,
}: Info_PageProps) {
  const { t } = useTranslation()
  // Extract header from children for consistent structure
  let header: React.ReactNode = null
  const otherChildren: React.ReactNode[] = []

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === Info_PageHeader) {
      header = child
    } else {
      otherChildren.push(child)
    }
  })

  // Loading state
  if (loading) {
    return (
      <div className={cn('h-full flex flex-col', className)}>
        {header}
        <div className="flex-1 flex items-center justify-center">
          <Spinner className="text-lg text-tertiary" />
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('h-full flex flex-col', className)}>
        {header}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-center">
          <AlertCircle className="size-6 text-destructive" aria-hidden />
          <p className="text-label font-medium text-foreground">{t('common.errorLoadingContent')}</p>
          <p className="max-w-md text-label-sm text-tertiary">{error}</p>
        </div>
      </div>
    )
  }

  // Empty state
  if (empty) {
    return (
      <div className={cn('h-full flex flex-col', className)}>
        {header}
        <div className="flex-1 flex items-center justify-center">
          <p className="text-label text-tertiary">{empty}</p>
        </div>
      </div>
    )
  }

  // Normal content
  return (
    <div className={cn('h-full flex flex-col', className)}>
      {header}
      {otherChildren}
    </div>
  )
}

function Info_PageHeader({ className, ...props }: Info_PageHeaderProps) {
  return <PanelHeader className={className} {...props} />
}

function Info_PageHero({ avatar, title, tagline, meta, actions, className }: Info_PageHeroProps) {
  return (
    <div className={cn('mt-2 flex items-center gap-3.5', className)}>
      {/* Brand tile: the hairline keeps dark marks (GitHub) visible on dark surfaces */}
      <div className="size-9 shrink-0 overflow-hidden rounded-md ring-1 ring-[var(--border-strong)]">
        {avatar}
      </div>
      <div className="flex-1 min-w-0">
        {title && (
          // Wraps rather than truncating: on detail pages this is the only place the full name appears
          <h2 className="text-title text-foreground [overflow-wrap:anywhere]">
            {title}
          </h2>
        )}
        {(meta || tagline) && (
          <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-label-sm text-secondary', title && 'mt-0.5')}>
            {meta}
            {tagline && <span className="min-w-0 line-clamp-2">{tagline}</span>}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

function Info_PageContent({ children, className }: Info_PageContentProps) {
  return (
    <div className="relative flex-1 min-h-0">
      {/* No edge mask: the hero sits 16px under the header and a fade would dim it. */}
      <ScrollArea className="h-full">
        <div className={DETAIL_COLUMN_CLASS}>
          <div className={cn('space-y-6', className)}>{children}</div>
        </div>
      </ScrollArea>
    </div>
  )
}

export const Info_Page = Object.assign(Info_PageRoot, {
  Header: Info_PageHeader,
  Hero: Info_PageHero,
  Content: Info_PageContent,
})
