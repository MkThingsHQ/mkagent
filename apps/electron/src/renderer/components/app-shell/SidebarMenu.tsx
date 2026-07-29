import { useTranslation } from 'react-i18next'
import { CheckCheck, Plus } from 'lucide-react'
import { useMenuComponents } from '@/components/ui/menu-context'

export type SidebarMenuType = 'allSessions' | 'skills'

export interface SidebarMenuProps {
  type: SidebarMenuType
  onMarkAllRead?: () => void
  onAddSkill?: () => void
}

export function SidebarMenu({ type, onMarkAllRead, onAddSkill }: SidebarMenuProps) {
  const { t } = useTranslation()
  const { MenuItem } = useMenuComponents()
  if (type === 'allSessions' && onMarkAllRead) return <MenuItem onClick={onMarkAllRead}><CheckCheck className="h-3.5 w-3.5" /><span className="flex-1">{t('sidebarMenu.markAllRead')}</span></MenuItem>
  if (type === 'skills' && onAddSkill) return <MenuItem onClick={onAddSkill}><Plus className="h-3.5 w-3.5" /><span className="flex-1">{t('sidebarMenu.addSkill')}</span></MenuItem>
  return null
}
