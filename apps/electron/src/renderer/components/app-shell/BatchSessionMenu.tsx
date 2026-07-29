/**
 * BatchSessionMenu - retained bulk session actions.
 */

import { useTranslation } from 'react-i18next'
import { useCallback, useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { Archive, Flag, FlagOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMenuComponents } from '@/components/ui/menu-context'
import { useSelectedIds, useSessionSelection } from '@/hooks/useSession'
import { sessionMetaMapAtom, type SessionMeta } from '@/atoms/sessions'
import { useAppShellContext } from '@/context/AppShellContext'

export function BatchSessionMenu() {
  const { t } = useTranslation()
  const { MenuItem, Separator } = useMenuComponents()
  const selectedIds = useSelectedIds()
  const { clearMultiSelect } = useSessionSelection()
  const sessionMetaMap = useAtomValue(sessionMetaMapAtom)
  const {
    onArchiveSession,
    onFlagSession,
    onUnflagSession,
    onDeleteSession,
  } = useAppShellContext()

  const selectedMetas = useMemo(() => {
    const metas: SessionMeta[] = []
    selectedIds.forEach(id => {
      const meta = sessionMetaMap.get(id)
      if (meta) metas.push(meta)
    })
    return metas
  }, [selectedIds, sessionMetaMap])

  const allFlagged = selectedMetas.length > 0 && selectedMetas.every(meta => meta.isFlagged)

  const handleFlag = useCallback(() => {
    selectedIds.forEach(id => (allFlagged ? onUnflagSession(id) : onFlagSession(id)))
  }, [allFlagged, selectedIds, onFlagSession, onUnflagSession])

  const handleArchive = useCallback(() => {
    selectedIds.forEach(id => onArchiveSession(id))
    clearMultiSelect()
  }, [selectedIds, onArchiveSession, clearMultiSelect])

  const handleDelete = useCallback(async () => {
    const ids = [...selectedIds]
    if (ids.length === 0 || !(await onDeleteSession(ids[0]))) return
    for (const id of ids.slice(1)) await onDeleteSession(id, true)
    clearMultiSelect()
    toast(t('multiSelect.deleted', { count: ids.length }))
  }, [selectedIds, onDeleteSession, clearMultiSelect, t])

  return (
    <>
      <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
        {t('multiSelect.selected.session', { count: selectedIds.size })}
      </div>
      <Separator />
      <MenuItem onClick={handleFlag}>
        {allFlagged ? <FlagOff className="h-3.5 w-3.5" /> : <Flag className="h-3.5 w-3.5 text-info" />}
        <span>{allFlagged ? t('sessionMenu.unflag') : t('sessionMenu.flag')}</span>
      </MenuItem>
      <MenuItem onClick={handleArchive}>
        <Archive className="h-3.5 w-3.5" />
        <span>{t('sessionMenu.archive')}</span>
      </MenuItem>
      <Separator />
      <MenuItem onClick={() => void handleDelete()} variant="destructive">
        <Trash2 className="h-3.5 w-3.5" />
        <span>{t('common.delete')}</span>
      </MenuItem>
    </>
  )
}
