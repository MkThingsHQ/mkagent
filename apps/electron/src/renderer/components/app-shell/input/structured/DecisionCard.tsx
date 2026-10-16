import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Decision card anatomy (design spec §7.6, mockup `.decision`): a raised card with a status ring,
 * a 28px tinted icon tile, a label-lg title, secondary detail text indented under the title,
 * a sunken mono well for the call detail, then a row of actions and an optional quiet foot.
 *
 * Inside the composer (InputContainer) the card material comes from the composer slot, which
 * also draws the ring (`decisionRingClass`); `standalone` cards draw their own.
 * The card is its own container: when it is narrower than 32rem (compact, small popovers) the
 * indent goes away and actions become 40px buttons sharing full-width rows.
 */

export type DecisionTone = 'info' | 'danger'

/** Status ring around the card (ring + elevation, no literal shadows). */
export function decisionRingClass(tone: DecisionTone): string {
  return tone === 'danger'
    ? 'ring-1 ring-[color:var(--destructive-border)]'
    : 'ring-1 ring-[color:var(--info-border)]'
}

const ICON_TILE_TONE: Record<DecisionTone, string> = {
  info: 'bg-info-tint text-info',
  danger: 'bg-destructive-tint text-destructive',
}

/** Content under the title lines up with the title (28px tile + 10px gap) on wide cards. */
const INDENT = 'ml-[38px] @max-lg/decision:ml-0'

/** Action buttons: 32px (Button size lg) on wide cards, 40px and sharing the row when narrow. */
export const DECISION_ACTION = '@max-lg/decision:h-control-xl @max-lg/decision:flex-auto'

interface DecisionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone: DecisionTone
  /** Draw the card material itself (not hosted by the composer slot) */
  standalone?: boolean
}

export function DecisionCard({ tone, standalone = false, className, children, ...props }: DecisionCardProps) {
  return (
    <div
      data-decision-tone={tone}
      className={cn(
        '@container/decision flex h-full flex-col overflow-hidden text-foreground',
        standalone && cn('rounded-xl bg-raised shadow-elev-2', decisionRingClass(tone)),
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/** Scroll region: grows to the available height and scrolls before the actions disappear. */
export function DecisionBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto px-3.5 pt-3.5', className)}>
      {children}
    </div>
  )
}

export function DecisionHeader({
  tone,
  icon,
  title,
  aside,
}: {
  tone: DecisionTone
  icon: React.ReactNode
  title: React.ReactNode
  /** Quiet trailing context after the title (e.g. the source name) */
  aside?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn('grid size-control shrink-0 place-items-center rounded-md [&_svg]:size-4', ICON_TILE_TONE[tone])} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 text-label-lg font-semibold">
        {title}
        {aside && <span className="ml-2 text-label font-normal text-tertiary">{aside}</span>}
      </div>
    </div>
  )
}

/** Indented column under the title: impact text, risk chips, the call-detail well, form fields. */
export function DecisionDetails({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('mt-1.5 pb-0.5', INDENT, className)}>
      {children}
    </div>
  )
}

/** Call detail in a sunken mono well; keeps its own max height and scrolls inside. */
export function DecisionPreview({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'mt-2.5 max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-sunken px-2.5 py-2',
        'font-mono text-mono-ui text-secondary ring-1 ring-inset ring-separator',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function DecisionActions({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex shrink-0 flex-wrap items-center gap-2 px-3.5 pt-3 pb-3', className)}>
      <div className={cn('flex min-w-0 flex-1 flex-wrap items-center gap-2', INDENT)}>
        {children}
      </div>
    </div>
  )
}

/** Quiet foot under the actions (what "Always allow" does, where credentials go). */
export function DecisionFoot({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="-mt-1 flex shrink-0 items-center gap-1.5 px-3.5 pb-3 text-label-sm text-tertiary [&_svg]:size-3.5 [&_svg]:shrink-0">
      <div className={cn('flex min-w-0 items-center gap-1.5', INDENT)}>
        {icon}
        <span className="min-w-0">{children}</span>
      </div>
    </div>
  )
}

/** Spacer that pushes trailing actions (Deny / Cancel) right on wide cards; gone when narrow. */
export function DecisionSpacer() {
  return <span className="flex-1 @max-lg/decision:hidden" aria-hidden="true" />
}
