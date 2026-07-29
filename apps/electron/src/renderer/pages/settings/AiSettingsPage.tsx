import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LlmConnectionWithStatus } from '@mkagent/shared/config'
import { THINKING_LEVELS, type ThinkingLevel } from '@mkagent/shared/agent/thinking-levels'
import type { WorkspaceSettings } from '@mkagent/shared/protocol'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { SettingsCard, SettingsCardContent } from '@/components/settings/SettingsCard'
import { SettingsInput } from '@/components/settings/SettingsInput'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsSelect, SettingsSelectRow } from '@/components/settings/SettingsSelect'

interface ConnectionForm {
  name: string
  provider: string
  apiKey: string
  baseUrl: string
  model: string
  protocol: 'openai-completions' | 'anthropic-messages'
}

const emptyForm: ConnectionForm = {
  name: '', provider: 'openai', apiKey: '', baseUrl: '', model: '', protocol: 'openai-completions',
}

export default function AiSettingsPage({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const [connections, setConnections] = useState<LlmConnectionWithStatus[]>([])
  const [thinking, setThinking] = useState<ThinkingLevel>('medium')
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>({})
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState('')

  const reload = useCallback(async () => {
    const [nextConnections, nextThinking, nextWorkspaceSettings] = await Promise.all([
      window.electronAPI.listLlmConnectionsWithStatus(),
      window.electronAPI.getDefaultThinkingLevel(),
      workspaceId ? window.electronAPI.getWorkspaceSettings(workspaceId) : Promise.resolve(null),
    ])
    setConnections(nextConnections)
    setThinking(nextThinking)
    setWorkspaceSettings(nextWorkspaceSettings ?? {})
  }, [workspaceId])

  useEffect(() => {
    void reload()
    return window.electronAPI.onLlmConnectionsChanged(() => void reload())
  }, [reload])

  const connectionOptions = useMemo(
    () => connections.map(connection => ({ value: connection.slug, label: connection.name })),
    [connections],
  )
  const thinkingOptions = THINKING_LEVELS.map(level => ({ value: level.id, label: t(level.nameKey) }))

  const save = async () => {
    const custom = Boolean(form.baseUrl)
    const slug = (form.name || form.provider).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const result = await window.electronAPI.setupLlmConnection({
      slug,
      credential: form.apiKey,
      piAuthProvider: custom ? undefined : form.provider,
      baseUrl: form.baseUrl || undefined,
      customEndpoint: custom ? { api: form.protocol } : undefined,
      defaultModel: form.model || undefined,
      models: form.model ? [form.model] : undefined,
    })
    setMessage(result.success ? t('common.saved') : result.error ?? t('common.error'))
    if (result.success) {
      setForm(emptyForm)
      await reload()
    }
  }

  return <div className="flex h-full flex-col">
    <PanelHeader title={t('settings.ai.title')} />
    <div className="mask-fade-y min-h-0 flex-1"><ScrollArea className="h-full"><div className="mx-auto max-w-3xl space-y-8 px-5 py-7">
      <SettingsSection title={t('settings.ai.defaultSection')} description={t('settings.ai.defaultSectionDesc')}>
        <SettingsCard>
          <SettingsSelectRow label={t('settings.ai.connection')} description={t('settings.ai.connectionDesc')} value={connections.find(item => item.isDefault)?.slug ?? ''} onValueChange={slug => void window.electronAPI.setDefaultLlmConnection(slug).then(reload)} options={connectionOptions} />
          <SettingsSelectRow label={t('settings.ai.thinking')} description={t('settings.ai.thinkingDesc')} value={thinking} onValueChange={value => { const level = value as ThinkingLevel; setThinking(level); void window.electronAPI.setDefaultThinkingLevel(level) }} options={thinkingOptions} />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('settings.ai.workspaceOverrides')} description={t('settings.ai.workspaceOverridesDesc')}>
        <SettingsCard>
          <SettingsSelectRow label={t('settings.ai.workspaceConnectionOverride')} value={workspaceSettings.defaultLlmConnection ?? '__default__'} onValueChange={value => { const next = value === '__default__' ? undefined : value; setWorkspaceSettings(current => ({ ...current, defaultLlmConnection: next })); void window.electronAPI.updateWorkspaceSetting(workspaceId, 'defaultLlmConnection', next) }} options={[{ value: '__default__', label: t('settings.ai.inheritFromApp') }, ...connectionOptions]} />
          <SettingsInput label={t('settings.ai.workspaceModelOverride')} value={workspaceSettings.model ?? ''} onChange={model => { const next = model.trim() || undefined; setWorkspaceSettings(current => ({ ...current, model })); void window.electronAPI.updateWorkspaceSetting(workspaceId, 'model', next) }} placeholder={t('settings.ai.inheritFromApp')} inCard />
          <SettingsSelectRow label={t('settings.ai.workspaceThinkingOverride')} value={workspaceSettings.thinkingLevel ?? '__default__'} onValueChange={value => { const next = value === '__default__' ? undefined : value as ThinkingLevel; setWorkspaceSettings(current => ({ ...current, thinkingLevel: next })); void window.electronAPI.updateWorkspaceSetting(workspaceId, 'thinkingLevel', next) }} options={[{ value: '__default__', label: t('settings.ai.inheritFromApp') }, ...thinkingOptions]} />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('settings.ai.connections')} description={t('settings.ai.connectionsDesc')}>
        <SettingsCard>{connections.length === 0
          ? <div className="px-4 py-3.5 text-sm text-muted-foreground">{t('settings.ai.noConnections')}</div>
          : connections.map(connection => <SettingsRow key={connection.slug} label={connection.name} description={connection.defaultModel ?? connection.piAuthProvider ?? connection.baseUrl}><div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{connection.isDefault ? t('settings.ai.defaultSection') : connection.isAuthenticated ? t('settings.ai.connectionValid') : t('settings.ai.notAuthenticated')}</span><Button size="sm" variant="ghost" onClick={() => void window.electronAPI.deleteLlmConnection(connection.slug).then(reload)}>{t('common.delete')}</Button></div></SettingsRow>)}</SettingsCard>
      </SettingsSection>

      <SettingsSection title={t('settings.ai.addConnection')}>
        <SettingsCard divided={false}><SettingsCardContent className="grid gap-4"><div className="grid grid-cols-2 gap-3">
          <SettingsInput label="Connection name" value={form.name} onChange={name => setForm(current => ({ ...current, name }))} />
          <SettingsInput label="Provider preset" value={form.provider} onChange={provider => setForm(current => ({ ...current, provider }))} placeholder="openai, google, ollama…" />
          <SettingsInput label="API key" type="password" value={form.apiKey} onChange={apiKey => setForm(current => ({ ...current, apiKey }))} />
          <SettingsInput label="Base URL" type="url" value={form.baseUrl} onChange={baseUrl => setForm(current => ({ ...current, baseUrl }))} placeholder="http://localhost:11434/v1" />
          <SettingsInput label={t('settings.ai.model')} value={form.model} onChange={model => setForm(current => ({ ...current, model }))} />
          <SettingsSelect label="Protocol" value={form.protocol} onValueChange={protocol => setForm(current => ({ ...current, protocol: protocol as ConnectionForm['protocol'] }))} options={[{ value: 'openai-completions', label: 'OpenAI Completions' }, { value: 'anthropic-messages', label: 'Anthropic Messages' }]} />
        </div><div className="flex items-center gap-3"><Button onClick={() => void save()}>{t('common.save')}</Button><span className="text-sm text-muted-foreground">{message}</span></div></SettingsCardContent></SettingsCard>
      </SettingsSection>
    </div></ScrollArea></div>
  </div>
}
