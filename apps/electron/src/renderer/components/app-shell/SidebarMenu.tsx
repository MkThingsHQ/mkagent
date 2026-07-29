/**
 * SidebarMenu - retained Lite context-menu actions from Craft.
 *
 * MkAgent keeps only session and Skill navigation. Product menus for Sources,
 * labels, user statuses, Projects, Automations, and custom Views are removed.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { AppWindow, CheckCheck, Plus } from 'lucide-react'
import { useMenuComponents } from '@/components/ui/menu-context'

export type SidebarMenuType = 'allSessions' | 'skills' | 'newSession'

export interface SidebarMenuProps {
  type: SidebarMenuType
  onMarkAllRead?: () => void
  onAddSkill?: () => void
}

export function SidebarMenu({ type, onMarkAllRead, onAddSkill }: SidebarMenuProps) {
  const { t } = useTranslation()
  const { MenuItem } = useMenuComponents()

  if (type === 'newSession') {
    return (
      <MenuItem onClick={() => window.electronAPI.openUrl('mkagent://action/new-session?window=focused')}>
        <AppWindow className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sidebarMenu.openInNewWindow')}</span>
      </MenuItem>
    )
  }

  if (type === 'allSessions' && onMarkAllRead) {
    return (
      <MenuItem onClick={onMarkAllRead}>
        <CheckCheck className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sidebarMenu.markAllRead')}</span>
      </MenuItem>
    )
  }

  if (type === 'skills' && onAddSkill) {
    return (
      <MenuItem onClick={onAddSkill}>
        <Plus className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sidebarMenu.addSkill')}</span>
      </MenuItem>
    )
  }

  return null
}
