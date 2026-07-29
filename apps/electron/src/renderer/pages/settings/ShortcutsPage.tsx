import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { isMac } from '@/lib/platform'

const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1.5 font-sans text-[11px] font-medium">{children}</kbd>
export default function ShortcutsPage() {
  const { t } = useTranslation()
  const sections = [
    { title: t('shortcuts.category.application'), rows: [[t('shortcuts.action.newChat'), [isMac ? '⌘' : 'Ctrl', 'N']], [t('shortcuts.action.settings'), [isMac ? '⌘' : 'Ctrl', ',']], [t('shortcuts.action.search'), [isMac ? '⌘' : 'Ctrl', 'K']]] },
    { title: t('shortcuts.listNavigation'), rows: [[t('shortcuts.navigateItems'), ['↑', '↓']], [t('shortcuts.goToFirst'), ['Home']], [t('shortcuts.goToLast'), ['End']]] },
    { title: t('shortcuts.sessionList'), rows: [[t('shortcuts.focusChatInput'), ['Enter']], [t('shortcuts.openContextMenu'), ['Right-click']]] },
    { title: t('shortcuts.chatInput'), rows: [[t('shortcuts.sendMessage'), ['Enter']], [t('shortcuts.newLine'), ['Shift', 'Enter']], [t('shortcuts.closeDialogBlur'), ['Esc']]] },
  ]
  return <div className="flex h-full flex-col"><PanelHeader title={t('settings.shortcuts.title')} /><div className="mask-fade-y min-h-0 flex-1"><ScrollArea className="h-full"><div className="mx-auto max-w-3xl space-y-8 px-5 py-7">{sections.map(section => <SettingsSection key={section.title} title={section.title}><SettingsCard>{section.rows.map(([label, keys]) => <SettingsRow key={label as string} label={label as string}><div className="flex items-center gap-1">{(keys as string[]).map((key, index) => <Kbd key={`${key}:${index}`}>{key}</Kbd>)}</div></SettingsRow>)}</SettingsCard></SettingsSection>)}</div></ScrollArea></div></div>
}
