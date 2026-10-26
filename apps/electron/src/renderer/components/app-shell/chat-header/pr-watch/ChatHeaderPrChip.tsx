/**
 * Coding mode's PR chip in the chat header's title row, after the working folder: the PR's state
 * glyph, number, status glyph (`prChipStatus`: conflicts, review feedback, failing or running CI, or
 * all good) and, on wide panels, its title. Hover opens the details card,
 * a click pins it (see useHoverPopover). The card's action (Resolve / Fix / Fix CI, see prCardAction)
 * sends a fixed prompt to this session: no model is involved in writing it.
 *
 * Renders only once a PR for the working folder's branch is known: nothing for a folder that isn't a
 * git repo, a branch without a PR, a remote that isn't GitHub, a missing credential, or while the
 * first lookup runs (no placeholder: until we know there is a PR, the header shows nothing).
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAppShellContext } from '@/context/AppShellContext'
import { useHoverPopover } from '@/hooks/useHoverPopover'
import { cn } from '@/lib/utils'
import { prCardAction, prCardActionMessage, prChipStatus, prStateTone, type PrChipStatus, type PrSummary, type PrWatchState } from './pr-watch-state'
import { PR_STATE_ICON, PrStatusGlyph, TONE_TEXT } from './pr-watch-visuals'
import { PrDetailsCard } from './PrDetailsCard'

/**
 * The title row's gaps around the chip, which the label strip reserves on top of the chip's width.
 * The chip itself never shrinks (its PR title only shows on wide panels), so the session title is
 * what gives way, after the folder name.
 */
export const PR_CHIP_RESERVE_PAD = 12

export interface ChatHeaderPrChipProps {
  /** The session the card's action prompts go to */
  sessionId: string
  state: PrWatchState
  onRefresh?: () => void
  /** The card opened or closed (the data hook loads details while it is open) */
  onCardOpenChange?: (open: boolean) => void
  /** The chip element, which the label strip measures and keeps room for */
  onReserveElChange?: (el: HTMLElement | null) => void
}

export function ChatHeaderPrChip({ sessionId, state, onRefresh, onCardOpenChange, onReserveElChange }: ChatHeaderPrChipProps) {
  const { t } = useTranslation()
  const { onOpenUrl, onSendMessage } = useAppShellContext()
  const popover = useHoverPopover()
  // How the card was opened, kept after it closes: only a hover-opened card must not take or return focus
  const pinnedRef = React.useRef(false)
  if (popover.open) pinnedRef.current = popover.pinned
  React.useEffect(() => {
    onCardOpenChange?.(popover.open)
  }, [popover.open, onCardOpenChange])

  if (state.kind !== 'pr') return null

  const { summary, details } = state
  const action = prCardAction(summary)
  const status = prChipStatus(summary)
  const handleAction = () => {
    const message = action && prCardActionMessage(action, summary, details)
    if (!message) return
    onSendMessage(sessionId, message)
    popover.onOpenChange(false)
  }
  const StateIcon = PR_STATE_ICON[summary.state]

  return (
    <Popover open={popover.open} onOpenChange={popover.onOpenChange}>
      <PopoverTrigger asChild>
        <button
          ref={onReserveElChange}
          type="button"
          {...popover.triggerProps}
          aria-label={[
            t('chat.prWatch.chipLabel', { number: summary.number, title: summary.title }),
            t(`chat.prWatch.state.${summary.state}`),
            status && statusLabel(status, summary, t),
          ].filter(Boolean).join(' · ')}
          className={cn(
            // The header is a window drag region: without no-drag, hover and clicks never reach the chip
            'titlebar-no-drag inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-label-sm -outline-offset-2',
            'transition-[background-color] duration-micro ease-out-subtle hover:duration-instant',
            'hover:bg-fill-hover data-[state=open]:bg-fill-hover',
          )}
        >
          <span className="inline-flex shrink-0 items-center gap-1">
            <StateIcon className={cn('size-3.5 shrink-0', TONE_TEXT[prStateTone(summary.state)])} aria-hidden />
            <span className="font-medium tabular-nums text-secondary">#{summary.number}</span>
            <PrStatusGlyph status={status} />
          </span>
          {/* The PR title often repeats the session title: only wide panels spend room on it (the card has it) */}
          <span className="min-w-0 max-w-[220px] truncate text-tertiary @max-[60rem]/panel:hidden">{summary.title}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        {...popover.contentProps}
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-[380px] max-w-[calc(100vw-24px)] p-0"
        tabIndex={-1}
        // A hover-opened card never takes focus (the composer keeps it); a clicked one focuses the card itself
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (pinnedRef.current) (event.currentTarget as HTMLElement | null)?.focus()
        }}
        onCloseAutoFocus={(event) => {
          if (!pinnedRef.current) event.preventDefault()
        }}
      >
        <PrDetailsCard
          summary={summary}
          details={details}
          refreshing={state.refreshing}
          onRefresh={onRefresh}
          onOpenUrl={onOpenUrl}
          action={action}
          onAction={handleAction}
        />
      </PopoverContent>
    </Popover>
  )
}

/** The status glyph in words, for the chip's accessible name. */
function statusLabel(status: PrChipStatus, summary: PrSummary, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (status) {
    case 'resolve': return t('chat.prWatch.merge.conflicting')
    case 'fix': return summary.unresolvedThreads > 0
      ? t('chat.prWatch.openThreads', { count: summary.unresolvedThreads })
      : t('chat.prWatch.review.changesRequested')
    case 'fix-ci': return t('chat.prWatch.checks.failure')
    case 'pending': return t('chat.prWatch.checks.pending')
    case 'unsynced': return t('chat.prWatch.unsynced')
    case 'ok': return t('chat.prWatch.allGood')
  }
}
