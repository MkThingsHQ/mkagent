import { useTranslation } from 'react-i18next'
import { formatDistanceToNowStrict } from 'date-fns'
import type { Locale } from 'date-fns'
import { CodeXml, Flag, ShieldAlert, AlertCircle, MessageSquare, FileCheck } from 'lucide-react'
import { useActionLabel } from '@/actions'
import { cn } from '@/lib/utils'
import { rendererPerf } from '@/lib/perf'
import { Spinner } from '@mkagent/ui'
import { EntityRow } from '@/components/ui/entity-row'
import { SessionMenu } from './SessionMenu'
import { BatchSessionMenu } from './BatchSessionMenu'
import { CompactSessionMenu } from './CompactSessionMenu'
import {
  getSessionTitle,
  getSessionPreviewText,
  highlightMatch,
  hasUnreadMeta,
  shortTimeLocale,
} from '@/utils/session'
import { useSessionListContext } from '@/context/SessionListContext'
import { useAppShellContext } from '@/context/AppShellContext'
import { navigate, routes } from '@/lib/navigate'
import type { SessionMeta } from '@/atoms/sessions'

export interface SessionItemProps {
  item: SessionMeta
  index: number
  itemProps: Record<string, unknown>
  isSelected: boolean
  isFirstInGroup: boolean
  isInMultiSelect: boolean
  onSelect: () => void
  onToggleSelect?: () => void
  onRangeSelect?: () => void
}
export function SessionItem({
  item,
  itemProps,
  isSelected,
  isFirstInGroup: _isFirstInGroup,
  isInMultiSelect,
  onSelect,
  onToggleSelect,
  onRangeSelect,
}: SessionItemProps) {
  const { t } = useTranslation()
  const ctx = useSessionListContext()
  const { isCompactMode } = useAppShellContext()
  const { hotkey: nextHotkey } = useActionLabel('chat.nextSearchMatch')
  const { hotkey: prevHotkey } = useActionLabel('chat.prevSearchMatch')
  const title = getSessionTitle(item)
  const activeMatch = ctx.activeChatMatchInfo
  const isActiveSession = isSelected && activeMatch?.sessionId === item.id
  const ripgrepMatchCount = ctx.contentSearchResults.get(item.id)?.matchCount
  const chatMatchCount = isActiveSession ? activeMatch!.count : ripgrepMatchCount
  const hasMatch = chatMatchCount != null && chatMatchCount > 0
  const hasPendingPrompt = ctx.hasPendingPrompt?.(item.id) ?? false
  const previewText = getSessionPreviewText(item)
  const runState = hasPendingPrompt ? 'needs-you' : item.isProcessing ? 'working' : item.lastMessageRole === 'error' ? 'failed' : item.lastMessageRole === 'plan' ? 'plan' : null
  const subtitle = runState ? <span className={cn('flex min-w-0 items-center gap-1.5', runState === 'needs-you' ? 'text-info' : runState === 'failed' ? 'text-destructive' : 'text-secondary')}>
    {runState === 'working' ? <Spinner className="text-accent size-3.5" /> : runState === 'needs-you' ? <ShieldAlert className="size-3.5" /> : runState === 'failed' ? <AlertCircle className="size-3.5" /> : <FileCheck className="size-3.5 text-success" />}
    {t(runState === 'needs-you' ? 'session.runState.needsYou' : runState === 'working' ? 'session.runState.working' : runState === 'failed' ? 'session.runState.failed' : 'session.runState.planReady')}
  </span> : previewText

  const handleClick = (event: React.MouseEvent) => {
    ctx.onFocusZone()
    if (event.button === 2) {
      if (ctx.isMultiSelectActive && !isInMultiSelect && onToggleSelect) onToggleSelect()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey) {
      event.preventDefault()
      navigate(routes.view.allSessions(item.id), { newPanel: true })
      return
    }
    if ((event.metaKey || event.ctrlKey) && onToggleSelect) {
      event.preventDefault()
      onToggleSelect()
      return
    }
    if (event.shiftKey && onRangeSelect) {
      event.preventDefault()
      onRangeSelect()
      return
    }
    rendererPerf.startSessionSwitch(item.id)
    onSelect()
  }

  const menuProps = {
    item,
    onRename: () => ctx.onRenameClick(item.id, title),
    onFlag: () => ctx.onFlag?.(item.id),
    onUnflag: () => ctx.onUnflag?.(item.id),
    onArchive: () => ctx.onArchive?.(item.id),
    onUnarchive: () => ctx.onUnarchive?.(item.id),
    onMarkUnread: () => ctx.onMarkUnread(item.id),
    onOpenInNewWindow: () => ctx.onOpenInNewWindow(item),
    onDelete: () => ctx.onDelete(item.id),
  }

  return (
    <EntityRow
      className="session-item"
      dataAttributes={{ 'data-session-id': item.id }}
      isSelected={isSelected}
      isInMultiSelect={isInMultiSelect}
      onMouseDown={handleClick}
      buttonProps={{
        ...itemProps,
        onKeyDown: (event: React.KeyboardEvent) => {
          ;(itemProps as { onKeyDown: (event: React.KeyboardEvent) => void }).onKeyDown(event)
          ctx.onKeyDown(event, item)
        },
      }}
      menuContent={<SessionMenu {...menuProps} />}
      contextMenuContent={ctx.isMultiSelectActive && isInMultiSelect ? <BatchSessionMenu /> : undefined}
      isCompactMode={isCompactMode}
      compactMenu={({ open, onOpenChange }) => (
        <CompactSessionMenu
          open={open}
          onOpenChange={onOpenChange}
          trigger={null}
          title={title}
          {...menuProps}
        />
      )}
      icon={item.codingMode ? <CodeXml aria-label={t("chat.codingMode.label")} className="size-4 text-tertiary" /> : <MessageSquare className="size-4 text-tertiary" />}
      moreButtonLabel={t('session.actionsFor', { title })}
      title={ctx.searchQuery ? highlightMatch(title, ctx.searchQuery) : title}
      titleClassName={cn('text-label', hasUnreadMeta(item) && 'font-semibold', item.isAsyncOperationOngoing && 'animate-shimmer-text')}
      subtitle={subtitle}
      titleTrailing={hasMatch ? (
        <span
          className="inline-flex min-w-6 items-center justify-center rounded-md bg-info-tint px-1 text-label-sm font-medium tabular-nums text-info"
          title={`Matches found (${nextHotkey} next, ${prevHotkey} prev)`}
        >
          {chatMatchCount}
        </span>
      ) : item.isFlagged ? (
        <Flag className="size-3.5 text-info" aria-label={t("sidebar.flagged")} />
      ) : item.lastMessageAt ? (
        <span className="text-label-sm text-tertiary whitespace-nowrap">
          {formatDistanceToNowStrict(new Date(item.lastMessageAt), {
            locale: shortTimeLocale as Locale,
            roundingMethod: 'floor',
          })}
        </span>
      ) : undefined}
    />
  )
}
