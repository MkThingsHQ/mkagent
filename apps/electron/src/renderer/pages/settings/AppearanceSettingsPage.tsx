import { useEffect, useMemo, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { i18n, LANGUAGES, type LanguageCode } from '@mkagent/shared/i18n'
import type { PresetTheme } from '@mkagent/shared/config/theme'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsSegmentedControl } from '@/components/settings/SettingsSegmentedControl'
import { SettingsSelect } from '@/components/settings/SettingsSelect'
import { useTheme } from '@/context/ThemeContext'

export default function AppearanceSettingsPage() {
  const { t } = useTranslation()
  const { mode, setMode, colorTheme, setColorTheme, font, setFont } = useTheme()
  const [presets, setPresets] = useState<PresetTheme[]>([])
  useEffect(() => { void window.electronAPI.loadPresetThemes().then(setPresets) }, [])
  const themeOptions = useMemo(() => [{ value: 'default', label: t('settings.appearance.default') }, ...presets.filter(value => value.id !== 'default').map(value => ({ value: value.id, label: value.theme.name || value.id }))], [presets, t])
  return <div className="flex h-full flex-col"><PanelHeader title={t('settings.appearance.title')} /><div className="mask-fade-y min-h-0 flex-1"><ScrollArea className="h-full"><div className="mx-auto max-w-3xl space-y-8 px-5 py-7">
    <SettingsSection title={t('settings.appearance.defaultTheme')}><SettingsCard>
      <SettingsRow label={t('settings.appearance.mode')}><SettingsSegmentedControl value={mode} onValueChange={setMode} options={[{ value: 'system', label: t('settings.appearance.system'), icon: <Monitor className="h-4 w-4" /> }, { value: 'light', label: t('settings.appearance.light'), icon: <Sun className="h-4 w-4" /> }, { value: 'dark', label: t('settings.appearance.dark'), icon: <Moon className="h-4 w-4" /> }]} /></SettingsRow>
      <SettingsRow label={t('settings.appearance.colorTheme')}><SettingsSelect value={colorTheme} onValueChange={setColorTheme} options={themeOptions} /></SettingsRow>
      <SettingsRow label={t('settings.appearance.font')}><SettingsSegmentedControl value={font} onValueChange={setFont} options={[{ value: 'inter', label: t('settings.appearance.fontInter') }, { value: 'system', label: t('settings.appearance.fontSystem') }]} /></SettingsRow>
      <SettingsRow label={t('settings.appearance.language')}><SettingsSelect value={(i18n.resolvedLanguage || i18n.language) as LanguageCode} onValueChange={value => { void i18n.changeLanguage(value); void window.electronAPI.changeLanguage?.(value) }} options={Object.entries(LANGUAGES).map(([value, config]) => ({ value, label: config.nativeName }))} /></SettingsRow>
    </SettingsCard></SettingsSection>
  </div></ScrollArea></div></div>
}
