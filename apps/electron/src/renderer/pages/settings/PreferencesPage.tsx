import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@mkagent/ui'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsInput } from '@/components/settings/SettingsInput'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsTextarea } from '@/components/settings/SettingsTextarea'

interface PreferencesFormState { name: string; timezone: string; city: string; country: string; notes: string }
const emptyState: PreferencesFormState = { name: '', timezone: '', city: '', country: '', notes: '' }

function parsePreferences(content: string): PreferencesFormState {
  try { const value = JSON.parse(content); return { name: value.name || '', timezone: value.timezone || '', city: value.location?.city || '', country: value.location?.country || '', notes: value.notes || '' } } catch { return emptyState }
}

function serializePreferences(state: PreferencesFormState): string {
  const value: Record<string, unknown> = {}
  if (state.name) value.name = state.name
  if (state.timezone) value.timezone = state.timezone
  if (state.city || state.country) value.location = { ...(state.city ? { city: state.city } : {}), ...(state.country ? { country: state.country } : {}) }
  if (state.notes) value.notes = state.notes
  value.updatedAt = Date.now()
  return JSON.stringify(value, null, 2)
}

export default function PreferencesPage({ onAgentEdit }: { onAgentEdit?: (path: string) => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(emptyState)
  const [loading, setLoading] = useState(true)
  const [preferencesPath, setPreferencesPath] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initial = useRef(true)
  const current = useRef(form)
  useEffect(() => { current.current = form }, [form])
  useEffect(() => { void window.electronAPI.readPreferences().then(result => { setForm(parsePreferences(result.content)); setPreferencesPath(result.path) }).finally(() => { setLoading(false); setTimeout(() => { initial.current = false }, 100) }) }, [])
  useEffect(() => {
    if (initial.current || loading) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void window.electronAPI.writePreferences(serializePreferences(form)), 500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [form, loading])
  useEffect(() => () => { if (!initial.current) void window.electronAPI.writePreferences(serializePreferences(current.current)) }, [])
  const update = useCallback(<K extends keyof PreferencesFormState>(key: K, value: PreferencesFormState[K]) => setForm(previous => ({ ...previous, [key]: value })), [])
  if (loading) return <div className="flex h-full items-center justify-center"><Spinner className="text-lg text-muted-foreground" /></div>
  return <div className="flex h-full flex-col">
    <PanelHeader title={t('settings.preferences.title')} />
    <div className="mask-fade-y min-h-0 flex-1"><ScrollArea className="h-full"><div className="mx-auto max-w-3xl space-y-8 px-5 py-7">
      <SettingsSection title={t('settings.preferences.basicInfo')} description={t('settings.preferences.basicInfoDesc')}><SettingsCard><SettingsInput label={t('settings.preferences.name')} description={t('settings.preferences.nameDesc')} value={form.name} onChange={value => update('name', value)} placeholder={t('settings.preferences.namePlaceholder')} inCard /><SettingsInput label={t('settings.preferences.timezone')} description={t('settings.preferences.timezoneDesc')} value={form.timezone} onChange={value => update('timezone', value)} placeholder={t('settings.preferences.timezonePlaceholder')} inCard /></SettingsCard></SettingsSection>
      <SettingsSection title={t('settings.preferences.location')} description={t('settings.preferences.locationDesc')}><SettingsCard><SettingsInput label={t('settings.preferences.city')} description={t('settings.preferences.cityDesc')} value={form.city} onChange={value => update('city', value)} placeholder={t('settings.preferences.cityPlaceholder')} inCard /><SettingsInput label={t('settings.preferences.country')} description={t('settings.preferences.countryDesc')} value={form.country} onChange={value => update('country', value)} placeholder={t('settings.preferences.countryPlaceholder')} inCard /></SettingsCard></SettingsSection>
      <SettingsSection title={t('settings.preferences.notes')} description={t('settings.preferences.notesDesc')} action={preferencesPath && onAgentEdit ? <Button size="sm" variant="outline" onClick={() => onAgentEdit(preferencesPath)}>{t('common.edit')}</Button> : undefined}><SettingsCard divided={false}><SettingsTextarea value={form.notes} onChange={value => update('notes', value)} placeholder={t('settings.preferences.notesPlaceholder')} rows={5} inCard /></SettingsCard></SettingsSection>
    </div></ScrollArea></div>
  </div>
}
