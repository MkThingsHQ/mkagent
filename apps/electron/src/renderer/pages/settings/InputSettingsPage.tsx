import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsSelectRow } from '@/components/settings/SettingsSelect'
import { SettingsToggle } from '@/components/settings/SettingsToggle'
import { isMac } from '@/lib/platform'

export default function InputSettingsPage() {
  const { t } = useTranslation()
  const [autoCapitalisation, setAutoCapitalisation] = useState(true)
  const [spellCheck, setSpellCheck] = useState(false)
  const [sendKey, setSendKey] = useState<'enter' | 'cmd-enter'>('enter')
  useEffect(() => { void Promise.all([window.electronAPI.getAutoCapitalisation(), window.electronAPI.getSpellCheck(), window.electronAPI.getSendMessageKey()]).then(([auto, spell, key]) => { setAutoCapitalisation(auto); setSpellCheck(spell); setSendKey(key) }) }, [])
  return <div className="flex h-full flex-col"><PanelHeader title={t('settings.input.title')} /><div className="mask-fade-y min-h-0 flex-1"><ScrollArea className="h-full"><div className="mx-auto max-w-3xl space-y-8 px-5 py-7">
    <SettingsSection title={t('settings.input.typing')} description={t('settings.input.typingDesc')}><SettingsCard><SettingsToggle label={t('settings.input.autoCapitalisation')} description={t('settings.input.autoCapitalisationDesc')} checked={autoCapitalisation} onCheckedChange={value => { setAutoCapitalisation(value); void window.electronAPI.setAutoCapitalisation(value) }} /><SettingsToggle label={t('settings.input.spellCheck')} description={t('settings.input.spellCheckDesc')} checked={spellCheck} onCheckedChange={value => { setSpellCheck(value); void window.electronAPI.setSpellCheck(value) }} /></SettingsCard></SettingsSection>
    <SettingsSection title={t('settings.input.sending')} description={t('settings.input.sendingDesc')}><SettingsCard><SettingsSelectRow label={t('settings.input.sendMessageWith')} description={t('settings.input.sendMessageWithDesc')} value={sendKey} onValueChange={value => { const key = value as 'enter' | 'cmd-enter'; setSendKey(key); void window.electronAPI.setSendMessageKey(key) }} options={[{ value: 'enter', label: t('settings.input.enterKey') }, { value: 'cmd-enter', label: isMac ? t('settings.input.cmdEnterKey') : t('settings.input.ctrlEnterKey') }]} /></SettingsCard></SettingsSection>
  </div></ScrollArea></div></div>
}
