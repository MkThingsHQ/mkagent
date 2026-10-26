import { DropdownMenu, DropdownMenuTrigger, StyledDropdownMenuContent } from '@/components/ui/styled-dropdown'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Info, MoreHorizontal } from 'lucide-react'
import { useAppShellContext } from '@/context/AppShellContext'
import type { PrWatchState } from '@mkagent/shared/protocol'
import { ChatHeaderPrChip } from './pr-watch/ChatHeaderPrChip'
import { getPathBasename } from '@/lib/platform'
import type { SessionMeta } from '@/atoms/sessions'
import { routes } from '@/lib/navigate'
import { RenameDialog } from '@/components/ui/rename-dialog'
import { PanelHeaderCenterButton } from '@/components/ui/PanelHeaderCenterButton'
import { cn } from '@/lib/utils'
import { PanelHeader } from '../PanelHeader'
import { SessionMenu } from '../SessionMenu'
import { CompactSessionMenu } from '../CompactSessionMenu'
import { SessionInfoPopover } from '../SessionInfoPopover'

export interface ChatHeaderProps {
  sessionId: string
  item?: SessionMeta
  title: string
  isRegeneratingTitle?: boolean
  workingDirectory?: string
  sessionFolderPath?: string
  /** The branch's pull request; shown only for Coding-mode sessions, on the desktop layout */
  prWatch?: PrWatchState
  onRefreshPrWatch?: () => void
  /** The PR card opened or closed (details load while it is open) */
  onPrCardOpenChange?: (open: boolean) => void
}

/** v0.15 chat header: session actions and file information live with the title. */
export const ChatHeader = React.memo(function ChatHeader({ sessionId, item, title, isRegeneratingTitle, workingDirectory, sessionFolderPath, prWatch, onRefreshPrWatch, onPrCardOpenChange }: ChatHeaderProps) {
  const { t } = useTranslation()
  const { isCompactMode, leadingAction, rightSidebarButton, onRenameSession, onFlagSession, onUnflagSession, onArchiveSession, onUnarchiveSession, onMarkSessionUnread, onDeleteSession } = useAppShellContext()
  const [renameOpen, setRenameOpen] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState('')
  const [infoOpen, setInfoOpen] = React.useState(false)
  const openRename = React.useCallback(() => { setRenameValue(title); setRenameOpen(true) }, [title])
  const actions = {
    sessionId, sessionName: title,
    isFlagged: item?.isFlagged ?? false, isArchived: item?.isArchived ?? false,
    onRename: openRename,
    onFlag: () => onFlagSession(sessionId), onUnflag: () => onUnflagSession(sessionId),
    onArchive: () => onArchiveSession(sessionId), onUnarchive: () => onUnarchiveSession(sessionId),
    onMarkUnread: () => onMarkSessionUnread(sessionId), onDelete: () => onDeleteSession(sessionId),
    onOpenInNewWindow: () => window.electronAPI.openUrl(`mkagent://${routes.view.allSessions(sessionId)}?window=focused`),
  }
  return <>
    <PanelHeader
      title={title}
      titleRow={<div className="flex min-w-0 flex-1 items-center gap-1">
        <button type="button" onClick={openRename} title={t('chat.renameSession')} className="titlebar-no-drag min-w-0 shrink truncate rounded-md px-1.5 text-label-lg font-semibold hover:bg-fill-hover"><span className={cn(isRegeneratingTitle && 'animate-shimmer-text')}>{title}</span></button>
        {!isCompactMode && item?.codingMode && workingDirectory && <span title={workingDirectory} className="inline-flex min-w-0 max-w-[30%] shrink-0 items-center gap-1 text-label-sm text-tertiary"><FolderOpen className="size-3.5 shrink-0" /><span className="truncate">{getPathBasename(workingDirectory)}</span></span>}
        {!isCompactMode && item?.codingMode && prWatch && <ChatHeaderPrChip sessionId={sessionId} state={prWatch} onRefresh={onRefreshPrWatch} onCardOpenChange={onPrCardOpenChange} />}
      </div>}
      leadingAction={leadingAction}
      rightSidebarButton={rightSidebarButton}
      actions={<>{item && (isCompactMode ? <CompactSessionMenu {...actions} item={item} title={title} trigger={<PanelHeaderCenterButton icon={<MoreHorizontal className="size-4" />} tooltip={t('session.actionsFor', { title })} />} /> : <DropdownMenu><DropdownMenuTrigger asChild><PanelHeaderCenterButton icon={<MoreHorizontal className="size-4" />} tooltip={t('session.actionsFor', { title })} /></DropdownMenuTrigger><StyledDropdownMenuContent><SessionMenu {...actions} item={item} /></StyledDropdownMenuContent></DropdownMenu>)}<SessionInfoPopover sessionId={sessionId} sessionFolderPath={sessionFolderPath} open={infoOpen} onOpenChange={setInfoOpen} trigger={<PanelHeaderCenterButton icon={<Info className="size-4" />} tooltip={t('chat.sessionInfo')} onClick={() => setInfoOpen(true)} />} /></>}
    />
    <RenameDialog open={renameOpen} onOpenChange={setRenameOpen} title={t('chat.renameSession')} value={renameValue} onValueChange={setRenameValue} onSubmit={() => { const next = renameValue.trim(); if (next && next !== title) onRenameSession(sessionId, next); setRenameOpen(false) }} />
  </>
})
