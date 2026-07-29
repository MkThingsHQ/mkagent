import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NetworkProxySettings } from '@mkagent/shared/config'
import { Spinner } from '@mkagent/ui'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { SettingsCard, SettingsCardFooter } from '@/components/settings/SettingsCard'
import { SettingsInput } from '@/components/settings/SettingsInput'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsToggle } from '@/components/settings/SettingsToggle'

interface ProxyForm { enabled: boolean; httpProxy: string; httpsProxy: string; noProxy: string }
const emptyProxy: ProxyForm = { enabled: false, httpProxy: '', httpsProxy: '', noProxy: '' }
const toForm = (value?: NetworkProxySettings): ProxyForm => value ? { enabled: value.enabled, httpProxy: value.httpProxy || '', httpsProxy: value.httpsProxy || '', noProxy: value.noProxy || '' } : emptyProxy

export default function AppSettingsPage() {
  const { t } = useTranslation()
  const [notifications, setNotifications] = useState(true)
  const [keepAwake, setKeepAwake] = useState(false)
  const [browser, setBrowser] = useState(true)
  const [proxy, setProxy] = useState(emptyProxy)
  const [savedProxy, setSavedProxy] = useState(emptyProxy)
  const [saving, setSaving] = useState(false)
  const [version, setVersion] = useState('...')
  const isElectron = window.electronAPI.getRuntimeEnvironment() === 'electron'
  const dirty = useMemo(() => JSON.stringify(proxy) !== JSON.stringify(savedProxy), [proxy, savedProxy])
  useEffect(() => { void Promise.all([window.electronAPI.getNotificationsEnabled(), window.electronAPI.getKeepAwakeWhileRunning(), window.electronAPI.getBrowserToolEnabled(), window.electronAPI.getNetworkProxySettings(), window.electronAPI.getUpdateInfo()]).then(([nextNotifications, nextKeepAwake, nextBrowser, nextProxy, update]) => { setNotifications(nextNotifications); setKeepAwake(nextKeepAwake); setBrowser(nextBrowser); setProxy(toForm(nextProxy)); setSavedProxy(toForm(nextProxy)); setVersion(update.currentVersion) }) }, [])
  const saveProxy = useCallback(async () => { setSaving(true); try { await window.electronAPI.setNetworkProxySettings({ enabled: proxy.enabled, httpProxy: proxy.httpProxy.trim() || undefined, httpsProxy: proxy.httpsProxy.trim() || undefined, noProxy: proxy.noProxy.trim() || undefined }); const persisted = toForm(await window.electronAPI.getNetworkProxySettings()); setProxy(persisted); setSavedProxy(persisted) } finally { setSaving(false) } }, [proxy])
  return <div className="flex h-full flex-col"><PanelHeader title={t('settings.app.title')} /><div className="mask-fade-y min-h-0 flex-1"><ScrollArea className="h-full"><div className="mx-auto max-w-3xl space-y-8 px-5 py-7">
    <SettingsSection title={t('settings.notifications.title')}><SettingsCard><SettingsToggle label={t('settings.notifications.desktopNotifications')} description={t('settings.notifications.desktopNotificationsDesc')} checked={notifications} onCheckedChange={value => { setNotifications(value); void window.electronAPI.setNotificationsEnabled(value) }} /></SettingsCard></SettingsSection>
    <SettingsSection title={t('settings.power.title')}><SettingsCard><SettingsToggle label={t('settings.power.keepScreenAwake')} description={t('settings.power.keepScreenAwakeDesc')} checked={keepAwake} onCheckedChange={value => { setKeepAwake(value); void window.electronAPI.setKeepAwakeWhileRunning(value) }} /></SettingsCard></SettingsSection>
    <SettingsSection title={t('settings.tools.title')}><SettingsCard><SettingsToggle label={t('settings.tools.builtInBrowser')} description={t('settings.tools.builtInBrowserDesc')} checked={browser} onCheckedChange={value => { setBrowser(value); void window.electronAPI.setBrowserToolEnabled(value) }} /></SettingsCard></SettingsSection>
    <SettingsSection title={t('settings.network.title')}><SettingsCard><SettingsToggle label={t('settings.network.httpProxy')} description={t('settings.network.httpProxyDesc')} checked={proxy.enabled} onCheckedChange={enabled => setProxy(value => ({ ...value, enabled }))} />{proxy.enabled && <><SettingsInput label={t('settings.network.httpProxyLabel')} value={proxy.httpProxy} onChange={httpProxy => setProxy(value => ({ ...value, httpProxy }))} placeholder={t('settings.network.proxyPlaceholder')} inCard /><SettingsInput label={t('settings.network.httpsProxyLabel')} value={proxy.httpsProxy} onChange={httpsProxy => setProxy(value => ({ ...value, httpsProxy }))} placeholder={t('settings.network.proxyPlaceholder')} inCard /><SettingsInput label={t('settings.network.bypassRules')} value={proxy.noProxy} onChange={noProxy => setProxy(value => ({ ...value, noProxy }))} placeholder={t('settings.network.bypassPlaceholder')} inCard /></>}{dirty && <SettingsCardFooter><Button variant="ghost" size="sm" onClick={() => setProxy(savedProxy)} disabled={saving}>{t('common.reset')}</Button><Button size="sm" onClick={() => void saveProxy()} disabled={saving}>{saving && <Spinner className="mr-1.5" />}{t('common.save')}</Button></SettingsCardFooter>}</SettingsCard></SettingsSection>
    <SettingsSection title={t('settings.about.title')}><SettingsCard><SettingsRow label={t('settings.about.version')}><div className="flex items-center gap-2"><span className="text-muted-foreground">{version}</span>{isElectron && <Button size="sm" variant="secondary" onClick={() => void window.electronAPI.checkForUpdates()}>{t('settings.about.checkForUpdates')}</Button>}</div></SettingsRow></SettingsCard></SettingsSection>
  </div></ScrollArea></div></div>
}
