import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Workspace } from '@mkagent/core/types'
import type { WorkspaceSettings } from '@mkagent/shared/protocol'
import type { PermissionMode } from '@mkagent/shared/agent/mode-types'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsInput } from '@/components/settings/SettingsInput'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsSelectRow } from '@/components/settings/SettingsSelect'
import { SettingsToggle } from '@/components/settings/SettingsToggle'

const modes: PermissionMode[] = ['safe', 'ask', 'allow-all']

export default function WorkspaceSettingsPage({ workspace }: { workspace?: Workspace }) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<WorkspaceSettings>({})
  useEffect(() => { if (workspace) void window.electronAPI.getWorkspaceSettings(workspace.id).then(value => setSettings(value || {})) }, [workspace])
  if (!workspace) return <div className="flex h-full flex-col"><PanelHeader title={t('settings.workspace.workspaceSettings')} /><div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t('settings.workspace.noWorkspaceSelected')}</div></div>
  const save = async <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => { setSettings(current => ({ ...current, [key]: value })); await window.electronAPI.updateWorkspaceSetting(workspace.id, key, value) }
  const cycling = settings.cyclablePermissionModes || modes
  return <div className="flex h-full flex-col"><PanelHeader title={t('settings.workspace.workspaceSettings')} /><div className="mask-fade-y min-h-0 flex-1"><ScrollArea className="h-full"><div className="mx-auto max-w-3xl space-y-8 px-5 py-7">
    <SettingsSection title={t('settings.workspace.workspaceInfo')}><SettingsCard><SettingsInput label={t('common.name')} description={workspace.rootPath} value={settings.name || workspace.name} onChange={value => void save('name', value)} inCard /></SettingsCard></SettingsSection>
    <SettingsSection title={t('settings.workspace.permissionsSection')}><SettingsCard><SettingsSelectRow label={t('settings.workspace.defaultMode')} description={t('settings.workspace.defaultModeDesc')} value={settings.permissionMode || 'ask'} onValueChange={value => void save('permissionMode', value as PermissionMode)} options={modes.map(value => ({ value, label: t(`mode.${value}`) }))} /></SettingsCard></SettingsSection>
    <SettingsSection title={t('settings.workspace.modeCycling')} description={t('settings.workspace.modeCyclingDesc')}><SettingsCard>{modes.map(mode => <SettingsToggle key={mode} label={t(`mode.${mode}`)} checked={cycling.includes(mode)} onCheckedChange={enabled => { const next = enabled ? [...cycling, mode] : cycling.filter(value => value !== mode); if (next.length >= 2) void save('cyclablePermissionModes', modes.filter(value => next.includes(value))) }} />)}</SettingsCard></SettingsSection>
    <SettingsSection title={t('settings.workspace.advanced')}><SettingsCard><SettingsRow label={t('settings.workspace.defaultWorkingDir')} description={settings.workingDirectory || t('settings.workspace.defaultWorkingDirDesc')}><Button size="sm" variant="secondary" onClick={() => void window.electronAPI.openFolderDialog().then(path => { if (path) void save('workingDirectory', path) })}>{t('common.browse')}</Button></SettingsRow></SettingsCard></SettingsSection>
  </div></ScrollArea></div></div>
}
