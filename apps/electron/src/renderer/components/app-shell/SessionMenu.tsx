/**
 * SessionMenu - retained Craft session actions for MkAgent Lite.
 */

import { useTranslation } from 'react-i18next'
import {
  Archive,
  ArchiveRestore,
  Trash2,
  Pencil,
  Flag,
  FlagOff,
  MailOpen,
  FolderOpen,
  Copy,
  AppWindow,
  Columns2,
  RefreshCw,
} from 'lucide-react'
import { useMenuComponents } from '@/components/ui/menu-context'
import { getFileManagerName } from '@/lib/platform'
import type { SessionMeta } from '@/atoms/sessions'
import { hasUnreadMeta, hasMessagesMeta } from '@/utils/session'
import { useSessionMenuActions } from '@/hooks/useSessionMenuActions'

export interface SessionMenuProps {
  item: SessionMeta
  onRename: () => void
  onFlag: () => void
  onUnflag: () => void
  onArchive: () => void
  onUnarchive: () => void
  onMarkUnread: () => void
  onOpenInNewWindow: () => void
  onDelete: () => void
}
export function SessionMenu({
  item,
  onRename,
  onFlag,
  onUnflag,
  onArchive,
  onUnarchive,
  onMarkUnread,
  onOpenInNewWindow,
  onDelete,
}: SessionMenuProps) {
  const { t } = useTranslation()
  const actions = useSessionMenuActions({ item })
  const { MenuItem, Separator } = useMenuComponents()
  const isFlagged = item.isFlagged ?? false
  const isArchived = item.isArchived ?? false

  return (
    <>
      {!isFlagged ? (
        <MenuItem onClick={onFlag}>
          <Flag className="h-3.5 w-3.5 text-info" />
          <span className="flex-1">{t('sessionMenu.flag')}</span>
        </MenuItem>
      ) : (
        <MenuItem onClick={onUnflag}>
          <FlagOff className="h-3.5 w-3.5" />
          <span className="flex-1">{t('sessionMenu.unflag')}</span>
        </MenuItem>
      )}

      {!isArchived ? (
        <MenuItem onClick={onArchive}>
          <Archive className="h-3.5 w-3.5" />
          <span className="flex-1">{t('sessionMenu.archive')}</span>
        </MenuItem>
      ) : (
        <MenuItem onClick={onUnarchive}>
          <ArchiveRestore className="h-3.5 w-3.5" />
          <span className="flex-1">{t('sessionMenu.unarchive')}</span>
        </MenuItem>
      )}

      {!hasUnreadMeta(item) && hasMessagesMeta(item) && (
        <MenuItem onClick={onMarkUnread}>
          <MailOpen className="h-3.5 w-3.5" />
          <span className="flex-1">{t('sessionMenu.markAsUnread')}</span>
        </MenuItem>
      )}

      <Separator />

      <MenuItem onClick={onRename}>
        <Pencil className="h-3.5 w-3.5" />
        <span className="flex-1">{t('common.rename')}</span>
      </MenuItem>
      <MenuItem onClick={actions.refreshTitle}>
        <RefreshCw className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sessionMenu.regenerateTitle')}</span>
      </MenuItem>

      <Separator />

      <MenuItem onClick={actions.openInNewPanel}>
        <Columns2 className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sessionMenu.openInNewPanel')}</span>
      </MenuItem>
      <MenuItem onClick={onOpenInNewWindow}>
        <AppWindow className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sessionMenu.openInNewWindow')}</span>
      </MenuItem>
      <MenuItem onClick={actions.showInFinder}>
        <FolderOpen className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sessionMenu.showInFileManager', { fileManager: getFileManagerName() })}</span>
      </MenuItem>
      <MenuItem onClick={actions.copyPath}>
        <Copy className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sessionMenu.copyPath')}</span>
      </MenuItem>

      <Separator />

      <MenuItem onClick={onDelete} variant="destructive">
        <Trash2 className="h-3.5 w-3.5" />
        <span className="flex-1">{t('common.delete')}</span>
      </MenuItem>
    </>
  )
}
