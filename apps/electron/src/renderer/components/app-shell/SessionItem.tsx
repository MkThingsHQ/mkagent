import { formatDistanceToNowStrict } from 'date-fns'
import type { Locale } from 'date-fns'
import { Flag, ShieldAlert } from 'lucide-react'
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
  isFirstInGroup,
  isInMultiSelect,
  onSelect,
  onToggleSelect,
  onRangeSelect,
}: SessionItemProps) {
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
  const previewText = isCompactMode ? getSessionPreviewText(item) : null

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
      showSeparator={!isFirstInGroup}
      separatorClassName="pl-[38px] pr-4"
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
      icon={(
        <div className={cn(
          'flex items-center justify-center overflow-hidden gap-1',
          'transition-all duration-200 ease-out',
          (item.isProcessing || hasUnreadMeta(item) || item.lastMessageRole === 'plan' || hasPendingPrompt)
            ? 'opacity-100 ml-0'
            : '!w-0 opacity-0 -ml-[10px]',
        )}>
          {item.isProcessing && <Spinner className="text-[10px]" />}
          {hasUnreadMeta(item) && (
            <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-label="Unread" />
          )}
          {item.lastMessageRole === 'plan' && (
            <span className="h-2.5 w-2.5 rounded-full bg-success" aria-label="Plan review" />
          )}
          {hasPendingPrompt && <ShieldAlert className="h-3.5 w-3.5 text-info" />}
        </div>
      )}
      title={ctx.searchQuery ? highlightMatch(title, ctx.searchQuery) : title}
      titleClassName={cn('text-[13px]', item.isAsyncOperationOngoing && 'animate-shimmer-text')}
      subtitle={previewText}
      titleTrailing={hasMatch ? (
        <span
          className={cn(
            'inline-flex items-center justify-center min-w-[24px] px-1 py-0.5 rounded-[6px] text-[10px] font-medium tabular-nums leading-tight whitespace-nowrap shadow-tinted',
            isSelected
              ? 'bg-yellow-300/50 border border-yellow-500 text-yellow-900'
              : 'bg-yellow-300/10 border border-yellow-600/20 text-yellow-800',
          )}
          style={{ '--shadow-color': isSelected ? '234, 179, 8' : '133, 77, 14' } as React.CSSProperties}
          title={`Matches found (${nextHotkey} next, ${prevHotkey} prev)`}
        >
          {chatMatchCount}
        </span>
      ) : item.isFlagged ? (
        <div className="p-1 flex items-center justify-center">
          <Flag className="h-3.5 w-3.5 text-info" />
        </div>
      ) : item.lastMessageAt ? (
        <span className="text-[11px] text-foreground/40 whitespace-nowrap">
          {formatDistanceToNowStrict(new Date(item.lastMessageAt), {
            locale: shortTimeLocale as Locale,
            roundingMethod: 'floor',
          })}
        </span>
      ) : undefined}
    />
  )
}
