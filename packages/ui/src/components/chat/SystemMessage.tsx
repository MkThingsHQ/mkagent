/**
 * SystemMessage - Displays system/info/error/warning messages
 *
 * Used for displaying non-conversational messages like errors, warnings,
 * info notices, and general system messages (viewer transcripts).
 *
 * Inline markers (spec §7.7): errors sit on the destructive tint with a 2px left rule,
 * warnings and info notices on the info tint, system notes on a neutral fill. The icon
 * carries the role color; the text stays in the foreground role for contrast.
 */

import { CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Markdown } from '../markdown'

export type SystemMessageType = 'error' | 'info' | 'warning' | 'system'

export interface SystemMessageProps {
  /** Message content (markdown supported) */
  content: string
  /** Message type determining visual style */
  type: SystemMessageType
  /** Additional className for the outer container */
  className?: string
}

// Style configuration for each message type
const MESSAGE_STYLES: Record<SystemMessageType, { surface: string; icon: LucideIcon; iconClass: string }> = {
  error: {
    surface: 'bg-destructive-tint border-l-2 border-destructive',
    icon: CircleAlert,
    iconClass: 'text-destructive',
  },
  warning: {
    surface: 'bg-info-tint border-l-2 border-info',
    icon: TriangleAlert,
    iconClass: 'text-info',
  },
  info: {
    surface: 'bg-info-tint border-l-2 border-info',
    icon: Info,
    iconClass: 'text-info',
  },
  system: {
    surface: 'bg-fill-hover',
    icon: Info,
    iconClass: 'text-tertiary',
  },
}

/**
 * SystemMessage - Renders a styled inline marker based on type
 */
export function SystemMessage({
  content,
  type,
  className,
}: SystemMessageProps) {
  const style = MESSAGE_STYLES[type]
  const Icon = style.icon

  return (
    <div className={cn('flex gap-2.5 rounded-md px-3 py-2.5 text-label text-foreground', style.surface, className)}>
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', style.iconClass)} />
      <div className="min-w-0 flex-1 break-words [&_.markdown-content>:first-child]:mt-0 [&_.markdown-content>:last-child]:mb-0 [&_p]:leading-5">
        <Markdown mode="minimal">{content}</Markdown>
      </div>
    </div>
  )
}
