/**
 * SettingsNavigator
 *
 * Navigator panel content for settings. Displays a list of settings sections
 * (App, Workspace, Shortcuts, Preferences) that can be selected to show in the details panel.
 *
 * Styling follows SessionList/SourcesListPanel patterns for visual consistency.
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal, AppWindow } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'
import { DropdownMenuProvider } from '@/components/ui/menu-context'
import { cn } from '@/lib/utils'
import type { DetailsPageMeta } from '@/lib/navigation-registry'
import type { SettingsSubpage } from '../../../shared/types'
import { SETTINGS_ITEMS } from '../../../shared/menu-schema'
import { SETTINGS_ICONS } from '@/components/icons/SettingsIcons'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'navigator',
}

interface SettingsNavigatorProps {
  /**
   * Currently selected settings subpage. `null` means the bare `settings`
   * route (no row highlighted) — happens in compact mode where the navigator
   * stands alone before the user drills into a subpage.
   */
  selectedSubpage: SettingsSubpage | null
  /** Called when a subpage is selected */
  onSelectSubpage: (subpage: SettingsSubpage) => void
}

interface SettingsItem {
  id: SettingsSubpage
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

interface SettingsItemRowProps {
  item: SettingsItem
  isSelected: boolean
  isFirst: boolean
  onSelect: () => void
}

/**
 * SettingsItemRow - Individual settings item with dropdown menu
 * Tracks menu open state to keep "..." button visible when menu is open
 */
function SettingsItemRow({ item, isSelected, onSelect }: SettingsItemRowProps) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const Icon = item.icon

  // Open settings page in a new window via deep link
  const handleOpenInNewWindow = () => {
    window.electronAPI.openUrl(`mkagent://settings/${item.id}?window=focused`)
  }

  return (
    <div className="settings-item" data-selected={isSelected || undefined}>
      {/* Same anatomy as the other list rows (EntityRow): icon · title / description, mail-style full-bleed
          fill on hover/selection, a hairline from the text edge; the "⋯" button is a named sibling
          revealed on hover/focus. */}
      <div className="settings-content relative group select-none after:pointer-events-none after:absolute after:right-0 after:bottom-0 after:left-[calc(var(--gutter)+26px)] after:h-px after:bg-separator in-data-[selected]:after:hidden">
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            'entity-row-btn flex w-full items-start gap-2.5 py-[9px] pl-gutter pr-9 text-left text-label -outline-offset-2',
            'transition-[background-color] duration-micro ease-out-subtle hover:duration-instant',
            isSelected ? 'bg-fill-selected' : 'hover:bg-fill-hover'
          )}
        >
          <Icon
            className={cn(
              'size-4 shrink-0 mt-px',
              isSelected ? 'text-foreground' : 'text-tertiary'
            )}
          />
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span data-slot="entity-row-title" className="font-medium text-foreground truncate">
              {item.label}
            </span>
            <span data-slot="entity-row-subtitle" className="text-label-sm text-secondary line-clamp-1">
              {item.description}
            </span>
          </div>
        </button>
        <div
          data-touch-reveal="true"
          className={cn(
            'absolute right-3 top-1.5 z-10',
            menuOpen
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto'
          )}
        >
          <DropdownMenu modal={true} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                aria-label={t('common.more')}
                className="inline-grid place-items-center size-6 rounded-sm text-secondary hover:bg-fill-pressed hover:text-foreground data-[state=open]:bg-fill-pressed data-[state=open]:text-foreground"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <StyledDropdownMenuContent align="end">
              <DropdownMenuProvider>
                <StyledDropdownMenuItem onClick={handleOpenInNewWindow}>
                  <AppWindow className="h-3.5 w-3.5" />
                  <span className="flex-1">{t("sessionMenu.openInNewWindow")}</span>
                </StyledDropdownMenuItem>
              </DropdownMenuProvider>
            </StyledDropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

export default function SettingsNavigator({
  selectedSubpage,
  onSelectSubpage,
}: SettingsNavigatorProps) {
  const { t } = useTranslation()

  const settingsItems: SettingsItem[] = useMemo(() =>
    SETTINGS_ITEMS.map((item) => ({
      id: item.id,
      label: t(item.labelKey),
      icon: SETTINGS_ICONS[item.id],
      description: t(item.descriptionKey),
    })),
    [t]
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="pt-1 pb-2">
          {settingsItems.map((item, index) => (
            <SettingsItemRow
              key={item.id}
              item={item}
              isSelected={selectedSubpage === item.id}
              isFirst={index === 0}
              onSelect={() => onSelectSubpage(item.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
