import { Archive, ArchiveRestore, Download, ExternalLink, Flag, FlagOff, MailOpen, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMenuComponents } from '@/components/ui/menu-context'
import type { Session } from '../../../shared/types'

export function SessionMenu({ session, onChanged, onDeleted }: { session: Session; onChanged: () => void; onDeleted: () => void }) {
  const { t } = useTranslation()
  const { MenuItem, Separator } = useMenuComponents()
  const command = (value: Parameters<typeof window.electronAPI.sessionCommand>[1]) => void window.electronAPI.sessionCommand(session.id, value).then(onChanged)
  const exportSession = async () => {
    const bundle = await window.electronAPI.exportSession(session.id)
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${session.name || session.id}.mkagent-session.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  return <>
    <MenuItem onClick={() => { const name = window.prompt(t('common.rename'), session.name || ''); if (name?.trim()) command({ type: 'rename', name: name.trim() }) }}><Pencil className="h-3.5 w-3.5" /><span className="flex-1">{t('common.rename')}</span></MenuItem>
    <MenuItem onClick={() => command({ type: session.isFlagged ? 'unflag' : 'flag' })}>{session.isFlagged ? <FlagOff className="h-3.5 w-3.5" /> : <Flag className="h-3.5 w-3.5" />}<span className="flex-1">{t(session.isFlagged ? 'sessionMenu.unflag' : 'sessionMenu.flag')}</span></MenuItem>
    <MenuItem onClick={() => command({ type: session.isArchived ? 'unarchive' : 'archive' })}>{session.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}<span className="flex-1">{t(session.isArchived ? 'sessionMenu.unarchive' : 'sessionMenu.archive')}</span></MenuItem>
    <MenuItem onClick={() => command({ type: 'markUnread' })}><MailOpen className="h-3.5 w-3.5" /><span className="flex-1">{t('sessionMenu.markAsUnread')}</span></MenuItem>
    <Separator />
    <MenuItem onClick={() => void window.electronAPI.openSessionInNewWindow(session.workspaceId, session.id)}><ExternalLink className="h-3.5 w-3.5" /><span className="flex-1">{t('sessionMenu.openInNewWindow')}</span></MenuItem>
    <MenuItem onClick={() => void exportSession()}><Download className="h-3.5 w-3.5" /><span className="flex-1">Export</span></MenuItem>
    <Separator />
    <MenuItem variant="destructive" onClick={() => { if (window.confirm(`${t('common.delete')} “${session.name || ''}”?`)) void window.electronAPI.deleteSession(session.id).then(onDeleted) }}><Trash2 className="h-3.5 w-3.5" /><span className="flex-1">{t('common.delete')}</span></MenuItem>
  </>
}
