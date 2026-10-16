/**
 * Info_StatePill
 *
 * Connection state pill (mockup `.state-pill`): 22px, a 6px dot plus a plain-language label in the
 * solved role color on its tint — ok (success), warn (info/amber), bad (destructive), off (neutral).
 * The label always names the state, so it never relies on color alone.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export type StatePillTone = 'ok' | 'warn' | 'bad' | 'off'

const toneClasses: Record<StatePillTone, string> = {
  ok: 'bg-success-tint text-success',
  warn: 'bg-info-tint text-info',
  bad: 'bg-destructive-tint text-destructive',
  off: 'bg-fill-hover text-secondary',
}

export function Info_StatePill({
  tone,
  children,
  className,
}: {
  tone: StatePillTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-label-sm font-medium',
        toneClasses[tone],
        className
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  )
}
