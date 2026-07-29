/**
 * CompactSessionMenu - Craft drawer presentation for retained session actions.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Archive,
  ArchiveRestore,
  AppWindow,
  ChevronDown,
  Columns2,
  Copy,
  Flag,
  FlagOff,
  FolderOpen,
  MailOpen,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import type { SessionMeta } from '@/atoms/sessions'
import { hasUnreadMeta, hasMessagesMeta } from '@/utils/session'
import { getFileManagerName } from '@/lib/platform'
import { useSessionMenuActions } from '@/hooks/useSessionMenuActions'

export interface CompactSessionMenuProps {
  title?: string
  badge?: React.ReactNode
  isRegeneratingTitle?: boolean
  item: SessionMeta
  onRename: () => void
  onFlag: () => void
  onUnflag: () => void
  onArchive: () => void
  onUnarchive: () => void
  onMarkUnread: () => void
  onOpenInNewWindow: () => void
  onDelete: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode | null
}
export function CompactSessionMenu({
  title,
  badge,
  isRegeneratingTitle,
  item,
  onRename,
  onFlag,
  onUnflag,
  onArchive,
  onUnarchive,
  onMarkUnread,
  onOpenInNewWindow,
  onDelete,
  open: controlledOpen,
  onOpenChange,
  trigger,
}: CompactSessionMenuProps) {
  const { t } = useTranslation()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = React.useCallback((next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }, [controlledOpen, onOpenChange])
  const actions = useSessionMenuActions({ item })
  const closeAfter = React.useCallback(
    (action: () => void) => () => {
      action()
      setOpen(false)
    },
    [setOpen],
  )

  React.useEffect(() => {
    setOpen(false)
  }, [item.id, setOpen])

  const triggerNode = trigger === null
    ? null
    : trigger !== undefined
      ? <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      : (
        <DrawerTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1 min-w-0 rounded-[6px] px-1.5 py-1',
              'hover:bg-foreground/5 active:bg-foreground/10',
            )}
          >
            <span className={cn('truncate text-sm font-medium', isRegeneratingTitle && 'animate-shimmer-text')}>
              {title}
            </span>
            {badge}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-foreground/50" />
          </button>
        </DrawerTrigger>
      )

  const row = (
    icon: React.ReactNode,
    label: string,
    action: () => void,
    destructive = false,
  ) => (
    <button
      type="button"
      onClick={closeAfter(action)}
      className={cn(
        'flex items-center gap-3 w-full px-3 py-3 rounded-[10px] text-left transition-colors',
        'hover:bg-foreground/5 active:bg-foreground/10',
        destructive && 'text-destructive hover:bg-destructive/10',
      )}
    >
      <span className="shrink-0 inline-flex items-center justify-center h-5 w-5">{icon}</span>
      <span className="flex-1 min-w-0 text-sm truncate">{label}</span>
    </button>
  )

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      {triggerNode}
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="!flex flex-row items-center gap-2 !text-left pr-3">
          <DrawerTitle className="flex-1 min-w-0 truncate">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="px-2 pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto">
          {!item.isFlagged
            ? row(<Flag className="h-4 w-4 text-info" />, t('sessionMenu.flag'), onFlag)
            : row(<FlagOff className="h-4 w-4" />, t('sessionMenu.unflag'), onUnflag)}
          {!item.isArchived
            ? row(<Archive className="h-4 w-4" />, t('sessionMenu.archive'), onArchive)
            : row(<ArchiveRestore className="h-4 w-4" />, t('sessionMenu.unarchive'), onUnarchive)}
          {!hasUnreadMeta(item) && hasMessagesMeta(item)
            ? row(<MailOpen className="h-4 w-4" />, t('sessionMenu.markAsUnread'), onMarkUnread)
            : null}
          <div className="my-1 mx-3 h-px bg-foreground/[0.06]" />
          {row(<Pencil className="h-4 w-4" />, t('common.rename'), onRename)}
          {row(<RefreshCw className="h-4 w-4" />, t('sessionMenu.regenerateTitle'), actions.refreshTitle)}
          <div className="my-1 mx-3 h-px bg-foreground/[0.06]" />
          {row(<Columns2 className="h-4 w-4" />, t('sessionMenu.openInNewPanel'), actions.openInNewPanel)}
          {row(<AppWindow className="h-4 w-4" />, t('sessionMenu.openInNewWindow'), onOpenInNewWindow)}
          {row(
            <FolderOpen className="h-4 w-4" />,
            t('sessionMenu.showInFileManager', { fileManager: getFileManagerName() }),
            actions.showInFinder,
          )}
          {row(<Copy className="h-4 w-4" />, t('sessionMenu.copyPath'), actions.copyPath)}
          <div className="my-1 mx-3 h-px bg-foreground/[0.06]" />
          {row(<Trash2 className="h-4 w-4" />, t('common.delete'), onDelete, true)}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
