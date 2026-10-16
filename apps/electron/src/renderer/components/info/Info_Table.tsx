/**
 * Info_Table
 *
 * Key/value card body (mockup `.kv`): a 140px label column (110px in a compact panel) in
 * secondary text, values in primary text, full-width hairlines between rows.
 * Use for Connection info, metadata display, etc.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface Info_TableProps {
  children: React.ReactNode
  /** Optional footer content (e.g., error alert) */
  footer?: React.ReactNode
  /** Label column width in pixels (default: 140) */
  labelWidth?: number
  className?: string
}

export interface Info_TableRowProps {
  /** Left column label */
  label: string
  /** Right column value (shorthand) */
  value?: React.ReactNode
  /** Right column content (for complex content, use instead of value) */
  children?: React.ReactNode
  className?: string
}

function Info_TableRoot({
  children,
  footer,
  labelWidth = 140,
  className,
}: Info_TableProps) {
  return (
    <div className={className}>
      <dl
        className="divide-y divide-separator"
        style={{ '--label-width': `${labelWidth}px` } as React.CSSProperties}
      >
        {children}
      </dl>
      {footer}
    </div>
  )
}

function Info_TableRow({ label, value, children, className }: Info_TableRowProps) {
  const content = children ?? value

  return (
    <div className={cn('flex gap-3 px-3.5 py-2.5 text-label', className)}>
      <dt className="w-[var(--label-width)] shrink-0 text-secondary @max-mobile/panel:w-[min(var(--label-width),110px)]">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-foreground">{content}</dd>
    </div>
  )
}

export const Info_Table = Object.assign(Info_TableRoot, {
  Row: Info_TableRow,
})
