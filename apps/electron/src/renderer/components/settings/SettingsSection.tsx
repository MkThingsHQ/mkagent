/**
 * SettingsSection, SettingsGroup, SettingsDivider
 *
 * Structural components for organizing settings pages.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

// ============================================
// SettingsSection
// ============================================

export interface SettingsSectionProps {
  /** Section title */
  title: string
  /** Optional description below title (supports ReactNode for inline links) */
  description?: React.ReactNode
  /** Content - usually SettingsCard or SettingsRadioGroup */
  children: React.ReactNode
  /** Additional className */
  className?: string
  /** Variant for different visual treatments */
  variant?: 'default' | 'danger'
  /** Optional action element (e.g., Edit button) shown at the right of the header */
  action?: React.ReactNode
}

/**
 * SettingsSection - A group: a quiet 12px semibold secondary label, optional tertiary hint, then its
 * card(s). The label is metadata, so it sits a step below the rows it heads (13px foreground titles)
 * instead of competing with them; the cards carry the content. An action (e.g. Edit) is centred on a
 * one-line header and bottom-aligned with a hint.
 *
 * @example
 * <SettingsSection title="Billing" description="Choose how you pay">
 *   <SettingsRadioGroup>...</SettingsRadioGroup>
 * </SettingsSection>
 */
export function SettingsSection({
  title,
  description,
  children,
  className,
  variant = 'default',
  action,
}: SettingsSectionProps) {
  return (
    <section className={cn('space-y-2', className)}>
      <div className={cn('flex justify-between gap-4', description ? 'items-end' : 'items-center')}>
        <div className="min-w-0 space-y-1">
          <h3
            className={cn(
              'text-label-sm font-semibold text-secondary',
              variant === 'danger' && 'text-destructive'
            )}
          >
            {title}
          </h3>
          {description && (
            <p className="text-label-sm text-tertiary">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

// ============================================
// SettingsGroup
// ============================================

export interface SettingsGroupProps {
  /** Group title */
  title: string
  /** Content - usually multiple SettingsSection components */
  children: React.ReactNode
  /** Additional className */
  className?: string
}

/**
 * SettingsGroup - Top-level divider for major sections (e.g., "App" vs "Workspace")
 *
 * @example
 * <SettingsGroup title="Workspace">
 *   <SettingsSection title="Model">...</SettingsSection>
 *   <SettingsSection title="Permissions">...</SettingsSection>
 * </SettingsGroup>
 */
export function SettingsGroup({ title, children, className }: SettingsGroupProps) {
  return (
    <div className={cn('space-y-6', className)}>
      <h2 className="border-b border-subtle pb-2 text-label-sm font-medium text-tertiary">
        {title}
      </h2>
      <div className="space-y-6">{children}</div>
    </div>
  )
}

// ============================================
// SettingsDivider
// ============================================

export interface SettingsDividerProps {
  /** Additional className */
  className?: string
}

/**
 * SettingsDivider - Horizontal separator between sections
 *
 * Use sparingly - vertical spacing is usually enough.
 */
export function SettingsDivider({ className }: SettingsDividerProps) {
  return <div className={cn('h-px bg-separator', className)} />
}
