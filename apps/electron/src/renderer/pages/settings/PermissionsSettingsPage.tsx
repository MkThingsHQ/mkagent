import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceSettings } from '@mkagent/shared/protocol'
import type { PermissionMode } from '@mkagent/shared/agent/mode-types'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SettingsCard, SettingsCardContent } from '@/components/settings/SettingsCard'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsSelectRow } from '@/components/settings/SettingsSelect'

export default function PermissionsSettingsPage({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<WorkspaceSettings>({})
  useEffect(() => { if (workspaceId) void window.electronAPI.getWorkspaceSettings(workspaceId).then(value => setSettings(value || {})) }, [workspaceId])
  return <div className="flex h-full flex-col"><PanelHeader title={t('settings.permissions.title')} /><div className="mask-fade-y min-h-0 flex-1"><ScrollArea className="h-full"><div className="mx-auto max-w-3xl space-y-8 px-5 py-7">
    <SettingsSection title={t('settings.workspace.defaultMode')} description={t('settings.workspace.defaultModeDesc')}><SettingsCard><SettingsSelectRow label={t('mode.permissionMode')} value={settings.permissionMode || 'ask'} onValueChange={value => { const permissionMode = value as PermissionMode; setSettings(current => ({ ...current, permissionMode })); void window.electronAPI.updateWorkspaceSetting(workspaceId, 'permissionMode', permissionMode) }} options={(['safe', 'ask', 'allow-all'] as const).map(value => ({ value, label: t(`mode.${value}`) }))} /></SettingsCard></SettingsSection>
    <SettingsSection title={t('settings.permissions.aboutPermissions')}><SettingsCard divided={false}><SettingsCardContent className="space-y-3 text-sm leading-relaxed text-foreground/70"><p>{t('settings.permissions.aboutText1')}</p><p>{t('settings.permissions.aboutText2')}</p></SettingsCardContent></SettingsCard></SettingsSection>
  </div></ScrollArea></div></div>
}
