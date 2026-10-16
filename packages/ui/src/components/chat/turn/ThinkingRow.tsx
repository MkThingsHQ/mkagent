import * as React from 'react'
import { cn } from '../../../lib/utils'
import { Spinner } from '../../ui/LoadingIndicator'
import { ROW_ICON_SLOT, SIZE_CONFIG } from './turn-classes'

/**
 * "Thinking..." / "Preparing response..." line: the working spinner in accent on the icon
 * column, label in secondary (spec §6.4 live line, visual part only).
 */
export function ThinkingRow({
  label,
  className,
  style,
}: {
  label: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={cn('flex min-h-7 min-w-0 items-center gap-2 text-label text-secondary', className)} style={style}>
      <span className={ROW_ICON_SLOT}>
        <Spinner className={cn(SIZE_CONFIG.spinnerSize, 'text-accent')} />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </div>
  )
}
