import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Flag,
  Inbox,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Upload,
  Zap,
} from 'lucide-react'
import type { AnnotationV1, StoredSession, Workspace } from '@mkagent/core/types'
import type { LlmConnectionWithStatus, NetworkProxySettings } from '@mkagent/shared/config'
import { i18n } from '@mkagent/shared/i18n'
import type { LoadedSkill } from '@mkagent/shared/skills'
import type { DeepLinkNavigation, FileAttachment, PermissionRequest, Session, SessionEvent, SkillFile, WorkspaceSettings } from '@mkagent/shared/protocol'
import { Markdown, SessionViewer, TooltipProvider } from '@mkagent/ui'
import { useTranslation } from 'react-i18next'
import { Button } from './components/ui/button'
import { SettingsCard as CraftSettingsCard, SettingsCardContent } from './components/settings/SettingsCard'
import { SettingsInput } from './components/settings/SettingsInput'
import { SettingsRow } from './components/settings/SettingsRow'
import { SettingsSection } from './components/settings/SettingsSection'
import { SettingsSelect, SettingsSelectRow } from './components/settings/SettingsSelect'
import { SettingsToggle } from './components/settings/SettingsToggle'
import { HeaderIconButton } from './components/ui/HeaderIconButton'
import { EntityRow } from './components/ui/entity-row'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from './components/ui/styled-dropdown'
import { LeftSidebar, type SidebarItem } from './components/app-shell/LeftSidebar'
import { PanelHeader } from './components/app-shell/PanelHeader'
import { TopBar } from './components/app-shell/TopBar'
import SettingsNavigator from './pages/settings/SettingsNavigator'
import mkagentIcon from './assets/mkagent_app_icon.png'

type Section = 'sessions' | 'skills' | 'settings'
type SettingsPage = 'app' | 'ai' | 'appearance' | 'input' | 'workspace' | 'permissions' | 'shortcuts' | 'preferences'
type SessionFilter = 'all' | 'unread' | 'flagged' | 'running' | 'archived'

const SETTINGS_PAGES: SettingsPage[] = ['app', 'ai', 'appearance', 'input', 'workspace', 'permissions', 'shortcuts', 'preferences']

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value)
}

function AppButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const primary = props.className?.split(' ').includes('primary')
  return <Button {...props} variant={primary ? 'default' : 'outline'} size="sm" className={props.className} />
}

function ChatPanel({ session, workspaceId, onChanged, onDeleted, onBranched }: {
  session: Session
  workspaceId: string
  onChanged: () => void
  onDeleted: () => void
  onBranched: (messageId: string, newPanel?: boolean) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [permission, setPermission] = useState<PermissionRequest | null>(null)
  const [connections, setConnections] = useState<LlmConnectionWithStatus[]>([])
  const pendingPlanRef = useRef<string | null>(null)

  useEffect(() => {
    void window.electronAPI.listLlmConnectionsWithStatus().then(setConnections)
    return window.electronAPI.onSessionEvent((event: SessionEvent) => {
      if (event.sessionId !== session.id) return
      if (event.type === 'permission_request') setPermission(event.request)
      if (event.type === 'info' && event.statusType === 'compaction_complete' && pendingPlanRef.current !== null) {
        pendingPlanRef.current = null
        void window.electronAPI.sendMessage(session.id, i18n.t('plan.approved')).then(async () => {
          await window.electronAPI.sessionCommand(session.id, { type: 'clearPendingPlanExecution' })
          onChanged()
        })
      }
      onChanged()
    })
  }, [onChanged, session.id])

  const send = async () => {
    const message = draft.trim()
    if (!message || session.isProcessing) return
    setDraft('')
    const selected = attachments
    setAttachments([])
    await window.electronAPI.sendMessage(session.id, message, selected)
    onChanged()
  }

  const addAttachment = async () => {
    const paths = await window.electronAPI.openFileDialog()
    const loaded = await Promise.all(paths.map(path => window.electronAPI.readFileAttachment(path)))
    setAttachments(current => [...current, ...loaded.filter((item): item is FileAttachment => item !== null)])
  }

  const respond = async (allowed: boolean, alwaysAllow = false) => {
    if (!permission) return
    await window.electronAPI.respondToPermission(session.id, permission.requestId, allowed, alwaysAllow)
    setPermission(null)
  }

  const planPath = session.messages.findLast(message => message.role === 'plan')?.planPath ?? ''
  const approvePlan = async (compact: boolean) => {
    await window.electronAPI.sessionCommand(session.id, { type: 'setPermissionMode', mode: 'allow-all' })
    if (!compact) {
      await window.electronAPI.sendMessage(session.id, i18n.t('plan.approved'))
      onChanged()
      return
    }
    pendingPlanRef.current = planPath
    await window.electronAPI.sessionCommand(session.id, { type: 'setPendingPlanExecution', planPath })
    await window.electronAPI.sendMessage(session.id, '/compact')
    onChanged()
  }

  const updateAnnotation = async (command: Parameters<typeof window.electronAPI.sessionCommand>[1]) => {
    await window.electronAPI.sessionCommand(session.id, command)
    onChanged()
  }

  const exportCurrentSession = async () => {
    const bundle = await window.electronAPI.exportSession(session.id)
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${session.name || session.id}.mkagent-session.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const selectedConnection = connections.find(connection => connection.slug === session.llmConnection)
    ?? connections.find(connection => connection.isDefault)
  const modelOptions = (selectedConnection?.models ?? []).map(model => typeof model === 'string' ? { id: model, name: model } : model)

  const footer = (
    <div className="px-4 pb-4 pt-2">
      {permission && (
        <div className="mb-2 rounded-[12px] border border-info/20 bg-info/5 p-3 text-sm">
          <div className="flex flex-col gap-1"><strong>{permission.toolName}</strong><span className="text-muted-foreground">{permission.description ?? permission.command}</span></div>
          <div className="flex items-center gap-2"><AppButton onClick={() => respond(false)}>Deny</AppButton><AppButton onClick={() => respond(true)}>Allow</AppButton><AppButton onClick={() => respond(true, true)}>Always allow</AppButton></div>
        </div>
      )}
      <div className="overflow-hidden rounded-[16px] bg-background shadow-middle">
        {attachments.length > 0 && <div className="flex flex-wrap gap-1 px-3 pt-3">{attachments.map(item => <span className="rounded-[6px] bg-foreground/5 px-2 py-1 text-xs" key={item.path}>{item.name}</span>)}</div>}
        <textarea
          className="min-h-[88px] w-full resize-none bg-transparent px-5 pb-3 pt-4 text-[14px] outline-none placeholder:text-muted-foreground/70"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          placeholder={t('chatInput.placeholder.newLine')}
        />
        <div className="flex items-center gap-1 border-t border-border/50 px-2 py-2">
          <button className="input-toolbar-btn inline-flex h-7 items-center gap-1 rounded-[6px] px-1.5 text-[13px] hover:bg-foreground/5" type="button" onClick={addAttachment}>{t('chat.attachFiles')}</button>
          <select className="input-toolbar-btn h-7 min-w-0 max-w-[150px] rounded-[6px] bg-transparent px-1.5 text-[13px] hover:bg-foreground/5" value={session.permissionMode ?? 'safe'} onChange={event => window.electronAPI.sessionCommand(session.id, { type: 'setPermissionMode', mode: event.target.value as 'safe' | 'ask' | 'allow-all' }).then(onChanged)}>
            <option value="safe">Safe</option><option value="ask">Ask</option><option value="allow-all">Allow all</option>
          </select>
          <div className="flex-1" />
          <select className="input-toolbar-btn h-7 min-w-0 max-w-[170px] rounded-[6px] bg-transparent px-1.5 text-[13px] hover:bg-foreground/5" value={session.llmConnection ?? ''} onChange={event => window.electronAPI.sessionCommand(session.id, { type: 'setConnection', connectionSlug: event.target.value }).then(onChanged)}>
            <option value="">Default connection</option>
            {connections.map(connection => <option key={connection.slug} value={connection.slug}>{connection.name}</option>)}
          </select>
          <select className="input-toolbar-btn h-7 min-w-0 max-w-[170px] rounded-[6px] bg-transparent px-1.5 text-[13px] hover:bg-foreground/5" value={session.model ?? ''} onChange={event => window.electronAPI.setSessionModel(session.id, workspaceId, event.target.value || null, selectedConnection?.slug).then(onChanged)}>
            <option value="">Default model</option>
            {modelOptions.map(model => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}
          </select>
          <select className="input-toolbar-btn h-7 rounded-[6px] bg-transparent px-1.5 text-[13px] hover:bg-foreground/5" value={session.thinkingLevel ?? 'medium'} onChange={event => window.electronAPI.sessionCommand(session.id, { type: 'setThinkingLevel', level: event.target.value as 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' }).then(onChanged)}>
            <option value="off">Off</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">Extra high</option><option value="max">Maximum</option>
          </select>
          {session.isProcessing
            ? <Button className="h-8 w-8 rounded-full p-0" type="button" variant="secondary" onClick={() => window.electronAPI.cancelProcessing(session.id).then(onChanged)}>■</Button>
            : <Button className="h-8 w-8 rounded-full p-0" type="button" disabled={!draft.trim()} onClick={send}>↑</Button>}
        </div>
      </div>
    </div>
  )

  const header = (
    <PanelHeader
      title={session.name || t('session.newSession')}
      actions={<div className="flex items-center gap-1">
        <HeaderIconButton icon={<Zap className="h-4 w-4" />} tooltip={t('browser.newWindow')} onClick={() => void window.electronAPI.browserPane.create(session.id)} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><HeaderIconButton icon={<MoreHorizontal className="h-4 w-4" />} tooltip={t('common.more')} /></DropdownMenuTrigger>
          <StyledDropdownMenuContent align="end">
            <StyledDropdownMenuItem onClick={() => void window.electronAPI.sessionCommand(session.id, { type: session.isFlagged ? 'unflag' : 'flag' }).then(onChanged)}>{session.isFlagged ? 'Unflag' : 'Flag'}</StyledDropdownMenuItem>
            <StyledDropdownMenuItem onClick={() => void window.electronAPI.sessionCommand(session.id, { type: session.isArchived ? 'unarchive' : 'archive' }).then(onChanged)}>{session.isArchived ? 'Restore' : 'Archive'}</StyledDropdownMenuItem>
            <StyledDropdownMenuItem onClick={() => void window.electronAPI.openSessionInNewWindow(workspaceId, session.id)}>Open in new window</StyledDropdownMenuItem>
            <StyledDropdownMenuItem onClick={() => void exportCurrentSession()}>Export</StyledDropdownMenuItem>
            <StyledDropdownMenuItem onClick={() => { const name = window.prompt('Session name', session.name ?? ''); if (name?.trim()) void window.electronAPI.sessionCommand(session.id, { type: 'rename', name: name.trim() }).then(onChanged) }}>Rename</StyledDropdownMenuItem>
            <StyledDropdownMenuSeparator />
            <StyledDropdownMenuItem variant="destructive" onClick={() => { if (window.confirm('Delete this session?')) void window.electronAPI.deleteSession(session.id).then(onDeleted) }}>Delete</StyledDropdownMenuItem>
          </StyledDropdownMenuContent>
        </DropdownMenu>
      </div>}
    />
  )

  return (
    <SessionViewer
      session={session as unknown as StoredSession}
      mode="interactive"
      defaultExpanded
      header={header}
      footer={footer}
      platformActions={{
        onOpenUrl: url => window.electronAPI.openUrl(url),
        onOpenFile: path => window.electronAPI.openFile(path),
      }}
      onAcceptPlan={() => approvePlan(false)}
      onAcceptPlanWithCompact={() => approvePlan(true)}
      onBranch={(messageId, options) => onBranched(messageId, options?.newPanel)}
      onAddAnnotation={(messageId, annotation) => updateAnnotation({ type: 'addAnnotation', messageId, annotation })}
      onRemoveAnnotation={(messageId, annotationId) => updateAnnotation({ type: 'removeAnnotation', messageId, annotationId })}
      onUpdateAnnotation={(messageId, annotationId, patch: Partial<AnnotationV1>) => updateAnnotation({ type: 'updateAnnotation', messageId, annotationId, patch })}
      onSaveAndSendFollowUp={async ({ note, selectedText }) => {
        await window.electronAPI.sendMessage(session.id, `${note}\n\n> ${selectedText}`)
        onChanged()
      }}
    />
  )
}

function SkillsPanel({ skill, files, workspaceId, onChanged, onAgentEdit }: {
  skill: LoadedSkill | null
  files: SkillFile[]
  workspaceId: string
  onChanged: () => void
  onAgentEdit: (skill: LoadedSkill) => void
}) {
  if (!skill) return <EmptyState title="Select a Skill" detail="Skills are discovered globally, per workspace, and from the current working directory." />
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-[clamp(28px,7vw,88px)] py-12">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-4"><div className="flex min-w-0 flex-col gap-1"><strong>{skill.metadata.name || skill.slug}</strong><span className="text-xs text-muted-foreground">{skill.source}</span></div><div className="flex items-center gap-2"><AppButton onClick={() => onAgentEdit(skill)}>Edit with agent</AppButton><AppButton onClick={() => window.electronAPI.openSkillInEditor(workspaceId, skill.slug)}>Editor</AppButton><AppButton onClick={() => window.electronAPI.openSkillInFinder(workspaceId, skill.slug)}>Folder</AppButton><AppButton onClick={() => { if (window.confirm(`Delete ${skill.slug}?`)) void window.electronAPI.deleteSkill(workspaceId, skill.slug).then(onChanged) }}>Delete</AppButton></div></div>
      <Markdown>{skill.content}</Markdown>
      {files.length > 0 && <div className="flex flex-wrap gap-2"><strong className="w-full">Files</strong>{files.map(file => <span className="rounded-[7px] bg-foreground/5 px-2 py-1 text-xs" key={file.name}>{file.name}</span>)}</div>}
    </div>
  )
}

function SettingsPanel({ page, workspaces, workspaceId, onWorkspacesChanged }: { page: SettingsPage; workspaces: Workspace[]; workspaceId: string; onWorkspacesChanged: () => void }) {
  const { t } = useTranslation()
  const [connections, setConnections] = useState<LlmConnectionWithStatus[]>([])
  const [proxy, setProxy] = useState<NetworkProxySettings>({ enabled: false })
  const [form, setForm] = useState({ name: '', provider: 'openai', apiKey: '', baseUrl: '', model: '', protocol: 'openai-completions' as 'openai-completions' | 'anthropic-messages' })
  const [message, setMessage] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>({})
  const reloadConnections = useCallback(() => window.electronAPI.listLlmConnectionsWithStatus().then(setConnections), [])

  useEffect(() => {
    if (page === 'ai') void reloadConnections()
    if (page === 'app') void window.electronAPI.getNetworkProxySettings().then(settings => setProxy(settings ?? { enabled: false }))
    if (page === 'permissions' && workspaceId) void window.electronAPI.getWorkspaceSettings(workspaceId).then(settings => setWorkspaceSettings(settings ?? {}))
  }, [page, reloadConnections, workspaceId])

  if (page === 'ai') {
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
      setMessage(result.success ? 'Connection saved.' : result.error ?? 'Unable to save connection.')
      if (result.success) void reloadConnections()
    }
    return <SettingsCard title={t('settings.ai.title')} detail={t('settings.ai.connectionsDesc')}>
      <SettingsSection title={t('settings.ai.connections')} description={t('settings.ai.connectionsDesc')}>
        <CraftSettingsCard>
          {connections.map(connection => <SettingsRow
            key={connection.slug}
            label={connection.name}
            description={connection.defaultModel ?? connection.piAuthProvider ?? connection.baseUrl}
          >
            <span className="text-xs text-muted-foreground">{connection.isDefault ? 'Default' : connection.isAuthenticated ? 'Ready' : 'Needs key'}</span>
            <Button size="sm" variant="ghost" onClick={() => void window.electronAPI.setDefaultLlmConnection(connection.slug).then(reloadConnections)}>Use</Button>
            <Button size="sm" variant="ghost" onClick={() => void window.electronAPI.deleteLlmConnection(connection.slug).then(reloadConnections)}>Delete</Button>
          </SettingsRow>)}
        </CraftSettingsCard>
      </SettingsSection>
      <SettingsSection title="Add connection">
        <CraftSettingsCard divided={false}>
          <SettingsCardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <SettingsInput label="Connection name" value={form.name} onChange={name => setForm({ ...form, name })} />
              <SettingsInput label="Provider preset" value={form.provider} onChange={provider => setForm({ ...form, provider })} placeholder="openai, google, ollama…" />
              <SettingsInput label="API key" type="password" value={form.apiKey} onChange={apiKey => setForm({ ...form, apiKey })} />
              <SettingsInput label="Base URL" type="url" value={form.baseUrl} onChange={baseUrl => setForm({ ...form, baseUrl })} placeholder="http://localhost:11434/v1" />
              <SettingsInput label="Default model" value={form.model} onChange={model => setForm({ ...form, model })} />
              <SettingsSelect label="Protocol" value={form.protocol} onValueChange={protocol => setForm({ ...form, protocol: protocol as typeof form.protocol })} options={[{ value: 'openai-completions', label: 'OpenAI Completions' }, { value: 'anthropic-messages', label: 'Anthropic Messages' }]} />
            </div>
            <div className="flex items-center gap-3"><Button onClick={() => void save()}>Save connection</Button><span className="text-sm text-muted-foreground">{message}</span></div>
          </SettingsCardContent>
        </CraftSettingsCard>
      </SettingsSection>
    </SettingsCard>
  }

  if (page === 'app') return <SettingsCard title={t('settings.app.title')} detail={t('settings.app.description')}>
    <SettingsSection title={t('settings.network.title')} description={t('settings.app.description')}>
      <CraftSettingsCard>
        <SettingsToggle label="Custom proxy" description="Use an HTTP(S) proxy for model and web requests." checked={proxy.enabled} onCheckedChange={enabled => setProxy({ ...proxy, enabled })} />
        {proxy.enabled && <>
          <SettingsInput label="HTTP proxy" value={proxy.httpProxy ?? ''} onChange={httpProxy => setProxy({ ...proxy, httpProxy })} inCard />
          <SettingsInput label="HTTPS proxy" value={proxy.httpsProxy ?? ''} onChange={httpsProxy => setProxy({ ...proxy, httpsProxy })} inCard />
          <SettingsInput label="No proxy" description="Comma-separated hosts" value={proxy.noProxy ?? ''} onChange={noProxy => setProxy({ ...proxy, noProxy })} inCard />
        </>}
      </CraftSettingsCard>
    </SettingsSection>
    <div className="flex items-center gap-3"><Button onClick={() => void window.electronAPI.setNetworkProxySettings(proxy).then(() => setMessage('Saved.'))}>Save</Button><span className="text-sm text-muted-foreground">{message}</span></div>
  </SettingsCard>

  if (page === 'workspace') return <SettingsCard title={t('settings.workspace.title')} detail={t('settings.workspace.description')}>
    <SettingsSection title="Workspaces">
      <CraftSettingsCard>{workspaces.map(workspace => <SettingsRow key={workspace.id} label={workspace.name} description={workspace.rootPath}><code className="text-xs text-muted-foreground">{workspace.slug}</code></SettingsRow>)}</CraftSettingsCard>
    </SettingsSection>
    <SettingsSection title="Add workspace">
      <CraftSettingsCard divided={false}><SettingsCardContent className="flex items-end gap-3"><SettingsInput className="flex-1" label="Workspace name" value={workspaceName} onChange={setWorkspaceName} /><Button onClick={async () => {
        const folder = await window.electronAPI.openFolderDialog()
        if (!folder || !workspaceName.trim()) return
        await window.electronAPI.createWorkspace(folder, workspaceName.trim())
        setWorkspaceName('')
        onWorkspacesChanged()
      }}>Create from folder</Button></SettingsCardContent></CraftSettingsCard>
    </SettingsSection>
  </SettingsCard>
  if (page === 'appearance') return <SettingsCard title={t('settings.appearance.title')} detail={t('settings.appearance.description')}><SettingsSection title="Theme"><CraftSettingsCard><SettingsSelectRow label="Color mode" value={document.documentElement.classList.contains('dark') ? 'dark' : 'light'} onValueChange={theme => { document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)); void window.electronAPI.setColorTheme(theme) }} options={['light', 'dark', 'system'].map(theme => ({ value: theme, label: t(`settings.appearance.${theme}`) }))} /></CraftSettingsCard></SettingsSection></SettingsCard>
  if (page === 'preferences') return <SettingsCard title={t('settings.preferences.title')} detail={t('settings.preferences.description')}><SettingsSection title={t('settings.appearance.language')}><CraftSettingsCard><SettingsSelectRow label={t('settings.appearance.language')} value={i18n.language} onValueChange={language => void i18n.changeLanguage(language)} options={[{ value: 'en', label: 'English' }, { value: 'zh-Hans', label: '简体中文' }]} /></CraftSettingsCard></SettingsSection></SettingsCard>
  if (page === 'input') return <SettingsCard title={t('settings.input.title')} detail={t('settings.input.description')}><p className="text-sm text-muted-foreground">{t('chatInput.placeholder.newLine')}</p></SettingsCard>
  if (page === 'shortcuts') return <SettingsCard title={t('settings.shortcuts.title')} detail={t('settings.shortcuts.description')}><div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-3 text-sm"><span>{t('session.newSession')}</span><kbd className="rounded-md bg-foreground/5 px-2 py-1">⌘N</kbd><span>{t('sidebar.search')}</span><kbd className="rounded-md bg-foreground/5 px-2 py-1">⌘K</kbd></div></SettingsCard>
  return <SettingsCard title={t('settings.permissions.title')} detail={t('settings.permissions.description')}>
    <SettingsSection title="Workspace defaults"><CraftSettingsCard><SettingsSelectRow label="Default permission mode" description="Controls how MkAgent asks before using tools." value={workspaceSettings.permissionMode ?? 'safe'} onValueChange={async value => {
      const permissionMode = value as NonNullable<WorkspaceSettings['permissionMode']>
      setWorkspaceSettings(current => ({ ...current, permissionMode }))
      await window.electronAPI.updateWorkspaceSetting(workspaceId, 'permissionMode', permissionMode)
    }} options={[{ value: 'safe', label: 'Safe' }, { value: 'ask', label: 'Ask' }, { value: 'allow-all', label: 'Allow all' }]} /></CraftSettingsCard></SettingsSection>
  </SettingsCard>
}

function SettingsCard({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return <div className="h-full overflow-y-auto">
    <PanelHeader title={title} />
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 pb-12 pt-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div>
      {children}
    </div>
  </div>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"><img className="h-14 w-14 rounded-[13px]" src={mkagentIcon} alt="" /><strong className="text-base text-foreground">{title}</strong><span>{detail}</span></div>
}

export default function App() {
  const { t } = useTranslation()
  const [section, setSection] = useState<Section>('sessions')
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('app')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [skills, setSkills] = useState<LoadedSkill[]>([])
  const [activeSkill, setActiveSkill] = useState<LoadedSkill | null>(null)
  const [skillFiles, setSkillFiles] = useState<SkillFile[]>([])
  const [query, setQuery] = useState('')
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>('all')
  const [panelWidths, setPanelWidths] = useState({ navigation: 300, list: 420 })
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [miniSession, setMiniSession] = useState<Session | null>(null)
  const refreshRef = useRef(0)
  const resizeRef = useRef<'navigation' | 'list' | null>(null)

  const refreshSessions = useCallback(async () => {
    const current = ++refreshRef.current
    const next = await window.electronAPI.getSessions()
    if (current !== refreshRef.current) return
    setSessions(next.filter(session => !workspaceId || session.workspaceId === workspaceId))
    if (activeSessionId) setActiveSession(await window.electronAPI.getSessionMessages(activeSessionId))
  }, [activeSessionId, workspaceId])

  const refreshWorkspaces = useCallback(async () => {
    const available = await window.electronAPI.getWorkspaces()
    setWorkspaces(available)
    if (!workspaceId && available[0]) setWorkspaceId(available[0].id)
  }, [workspaceId])

  useEffect(() => {
    void (async () => {
      const available = await window.electronAPI.getWorkspaces()
      const selected = await window.electronAPI.getWindowWorkspace()
      setWorkspaces(available)
      setWorkspaceId(selected ?? available[0]?.id ?? '')
    })()
  }, [])

  useEffect(() => {
    void window.electronAPI.readPreferences().then(result => {
      try {
        const layout = JSON.parse(result.content).uiLayout
        if (typeof layout?.navigation === 'number' && typeof layout?.list === 'number') {
          setPanelWidths({ navigation: layout.navigation, list: layout.list })
        }
      } catch {
        // Keep the defaults when the optional UI layout is missing or malformed.
      }
    })
  }, [])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (resizeRef.current === 'navigation') {
        setPanelWidths(current => ({ ...current, navigation: Math.min(360, Math.max(220, event.clientX)) }))
      } else if (resizeRef.current === 'list') {
        setPanelWidths(current => ({ ...current, list: Math.min(560, Math.max(300, event.clientX - current.navigation)) }))
      }
    }
    const stop = () => {
      if (!resizeRef.current) return
      resizeRef.current = null
      void window.electronAPI.readPreferences().then(result => {
        let preferences: Record<string, unknown> = {}
        try { preferences = JSON.parse(result.content) } catch { /* Start a valid preferences object. */ }
        return window.electronAPI.writePreferences(JSON.stringify({ ...preferences, uiLayout: panelWidths }, null, 2))
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
  }, [panelWidths])

  useEffect(() => {
    if (!workspaceId) return
    void refreshSessions()
    void window.electronAPI.getSkills(workspaceId).then(setSkills)
  }, [refreshSessions, workspaceId])

  useEffect(() => window.electronAPI.onSessionEvent(() => void refreshSessions()), [refreshSessions])

  useEffect(() => {
    void window.electronAPI.getColorTheme().then(saved => {
      const dark = saved === 'dark' || (saved === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
    })
  }, [])

  const selectSession = useCallback(async (id: string) => {
    setActiveSessionId(id)
    setActiveSession(await window.electronAPI.getSessionMessages(id))
    await window.electronAPI.sessionCommand(id, { type: 'setActiveViewing', workspaceId })
  }, [workspaceId])

  const newSession = useCallback(async () => {
    if (!workspaceId) return
    const created = await window.electronAPI.createSession(workspaceId)
    setSection('sessions')
    await refreshSessions()
    await selectSession(created.id)
  }, [refreshSessions, selectSession, workspaceId])

  const branchSession = useCallback(async (messageId: string, newPanel = false) => {
    if (!workspaceId || !activeSessionId) return
    const branch = await window.electronAPI.createSession(workspaceId, {
      branchFromSessionId: activeSessionId,
      branchFromMessageId: messageId,
      parentSessionId: activeSessionId,
    })
    await refreshSessions()
    if (newPanel) await window.electronAPI.openSessionInNewWindow(workspaceId, branch.id)
    else await selectSession(branch.id)
  }, [activeSessionId, refreshSessions, selectSession, workspaceId])

  useEffect(() => window.electronAPI.onDeepLinkNavigate((navigation: DeepLinkNavigation) => {
    const route = navigation.view?.split('/') ?? []
    if (route[0] === 'settings') {
      setSection('settings')
      if (SETTINGS_PAGES.includes(route[1] as SettingsPage)) setSettingsPage(route[1] as SettingsPage)
    } else if (route[0] === 'skills') {
      setSection('skills')
    } else if (route[0]) {
      setSection('sessions')
      setSessionFilter(route[0] === 'flagged' ? 'flagged' : route[0] === 'archived' ? 'archived' : 'all')
      const sessionIndex = route.indexOf('session')
      if (sessionIndex >= 0 && route[sessionIndex + 1]) void selectSession(route[sessionIndex + 1])
    }

    const id = navigation.actionParams?.id
    if (navigation.action === 'new-chat') void newSession()
    else if (id && navigation.action === 'delete-session') void window.electronAPI.deleteSession(id).then(refreshSessions)
    else if (id && navigation.action === 'flag-session') void window.electronAPI.sessionCommand(id, { type: 'flag' }).then(refreshSessions)
    else if (id && navigation.action === 'unflag-session') void window.electronAPI.sessionCommand(id, { type: 'unflag' }).then(refreshSessions)
  }), [newSession, refreshSessions, selectSession])

  const selectSkill = async (skill: LoadedSkill) => {
    setActiveSkill(skill)
    setSkillFiles(await window.electronAPI.getSkillFiles(workspaceId, skill.slug))
  }

  const startSkillMiniChat = async (skill?: LoadedSkill) => {
    if (!workspaceId) return
    const created = await window.electronAPI.createSession(workspaceId, {
      name: skill ? `Edit ${skill.metadata.name || skill.slug}` : 'Create Skill',
      systemPromptPreset: 'mini',
      hidden: true,
    })
    setMiniSession(await window.electronAPI.getSessionMessages(created.id))
    if (skill) {
      await window.electronAPI.sendMessage(created.id, `Help me edit the Skill \`${skill.slug}\`. Review its existing SKILL.md, ask for the intended changes, then update it with the Skill tools.`)
      setMiniSession(await window.electronAPI.getSessionMessages(created.id))
    }
  }

  const importSessionFile = async (file: File | undefined) => {
    if (!file || !workspaceId) return
    const bundle = JSON.parse(await file.text())
    const imported = await window.electronAPI.importSession(workspaceId, bundle, 'fork')
    await refreshSessions()
    await selectSession(imported.id)
  }

  const filteredSessions = useMemo(() => sessions.filter(session => {
    const haystack = `${session.name ?? ''} ${session.preview ?? ''}`.toLowerCase()
    const matchesFilter = sessionFilter === 'all' ? !session.isArchived
      : sessionFilter === 'unread' ? Boolean(session.hasUnread) && !session.isArchived
        : sessionFilter === 'flagged' ? Boolean(session.isFlagged) && !session.isArchived
          : sessionFilter === 'running' ? Boolean(session.isProcessing) && !session.isArchived
            : Boolean(session.isArchived)
    return matchesFilter && haystack.includes(query.toLowerCase())
  }), [query, sessionFilter, sessions])

  const sectionTitle = section === 'sessions' ? t('sidebar.allSessions') : section === 'skills' ? t('sidebar.skills') : t('sidebar.settings')
  const sidebarLinks: SidebarItem[] = [
    {
      id: 'nav:allSessions',
      title: t('sidebar.allSessions'),
      label: String(sessions.filter(session => !session.hidden).length),
      icon: Inbox,
      variant: section === 'sessions' && sessionFilter === 'all' ? 'default' : 'ghost',
      onClick: () => { setSection('sessions'); setSessionFilter('all') },
      expandable: true,
      expanded: true,
      items: [
        { id: 'nav:unread', title: t('sidebar.unread'), label: String(sessions.filter(session => session.hasUnread && !session.isArchived).length), icon: Inbox, variant: section === 'sessions' && sessionFilter === 'unread' ? 'default' : 'ghost', onClick: () => { setSection('sessions'); setSessionFilter('unread') } },
        { id: 'nav:running', title: t('sidebar.running'), label: String(sessions.filter(session => session.isProcessing).length), icon: Zap, variant: section === 'sessions' && sessionFilter === 'running' ? 'default' : 'ghost', onClick: () => { setSection('sessions'); setSessionFilter('running') } },
        { id: 'nav:flagged', title: t('sidebar.flagged'), label: String(sessions.filter(session => session.isFlagged && !session.isArchived).length), icon: Flag, variant: section === 'sessions' && sessionFilter === 'flagged' ? 'default' : 'ghost', onClick: () => { setSection('sessions'); setSessionFilter('flagged') } },
        { id: 'nav:archived', title: t('sidebar.archived'), label: String(sessions.filter(session => session.isArchived).length), icon: Archive, variant: section === 'sessions' && sessionFilter === 'archived' ? 'default' : 'ghost', onClick: () => { setSection('sessions'); setSessionFilter('archived') } },
      ],
    },
    { id: 'separator:primary', type: 'separator' },
    { id: 'nav:skills', title: t('sidebar.skills'), label: String(skills.length), icon: Zap, variant: section === 'skills' ? 'default' : 'ghost', onClick: () => setSection('skills') },
    { id: 'separator:settings', type: 'separator' },
    { id: 'nav:settings', title: t('sidebar.settings'), icon: Settings, variant: section === 'settings' ? 'default' : 'ghost', onClick: () => setSection('settings') },
  ]

  return <TooltipProvider>
    <div className="h-screen w-screen overflow-hidden bg-foreground/3 pt-[var(--topbar-height)] text-foreground">
      <TopBar
        workspaces={workspaces}
        activeWorkspaceId={workspaceId || null}
        onSelectWorkspace={async id => { setWorkspaceId(id); await window.electronAPI.switchWorkspace(id) }}
        onNewChat={() => void newSession()}
        onBack={() => {}}
        onForward={() => {}}
        canGoBack={false}
        canGoForward={false}
        onToggleSidebar={() => setSidebarVisible(value => !value)}
        onAddBrowserPanel={() => { if (activeSessionId) void window.electronAPI.browserPane.create(activeSessionId) }}
      />
      <div className="flex h-full items-stretch gap-[6px] overflow-hidden pb-[6px] pr-[6px]">
        {sidebarVisible && <aside className="h-full shrink-0 font-sans" style={{ width: panelWidths.navigation }}>
          <div className="flex h-full flex-col select-none">
            <div className="px-2 pb-2 shrink-0">
              <Button variant="ghost" onClick={() => void newSession()} className="w-full justify-start gap-2 rounded-[6px] bg-background px-2 py-[7px] text-[13px] font-normal shadow-minimal">
                <Plus className="h-3.5 w-3.5 shrink-0" />
                {t('session.newSession')}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-4"><LeftSidebar isCollapsed={false} links={sidebarLinks} /></div>
          </div>
        </aside>}
        {sidebarVisible && <div className="relative z-panel -mx-[3px] w-0 cursor-col-resize" onPointerDown={() => { resizeRef.current = 'navigation' }} />}

        <section className="relative z-panel flex h-full shrink-0 flex-col overflow-hidden rounded-[10px] bg-background shadow-middle" style={{ width: panelWidths.list }}>
          <PanelHeader
            title={sectionTitle}
            actions={<div className="flex items-center gap-1">
              {section === 'skills' && <HeaderIconButton icon={<Plus className="h-4 w-4" />} tooltip={t('skillsList.addSkill')} onClick={() => void startSkillMiniChat()} />}
              {section === 'sessions' && <label className="titlebar-no-drag relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-[6px] hover:bg-foreground/5"><Upload className="h-4 w-4" /><input className="absolute inset-0 cursor-pointer opacity-0" type="file" accept="application/json,.json" onChange={event => { void importSessionFile(event.target.files?.[0]); event.target.value = '' }} /></label>}
              <HeaderIconButton icon={<MoreHorizontal className="h-4 w-4" />} tooltip={t('common.more')} />
            </div>}
          />
          {section === 'sessions' && <div className="px-3 pb-2">
            <label className="flex h-8 items-center gap-2 rounded-[8px] bg-foreground/3 px-2.5 text-muted-foreground focus-within:ring-1 focus-within:ring-ring">
              <Search className="h-4 w-4" />
              <input className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none" placeholder={t('sidebar.search')} value={query} onChange={event => setQuery(event.target.value)} />
            </label>
          </div>}
          <div className="min-h-0 flex-1 overflow-y-auto" data-list-role={section}>
            {section === 'sessions' && filteredSessions.map((session, index) => <EntityRow
              key={session.id}
              className="session-item"
              showSeparator={index > 0}
              separatorClassName="pl-[38px] pr-4"
              isSelected={activeSessionId === session.id}
              onClick={() => void selectSession(session.id)}
              icon={<div className="flex items-center gap-1">{session.isProcessing ? <Zap className="h-3.5 w-3.5 text-info" /> : <span className="h-3.5 w-3.5 rounded-full border border-foreground/30" />}{session.hasUnread && <span className="h-2 w-2 rounded-full bg-accent" />}</div>}
              title={session.name || t('session.newSession')}
              titleClassName="text-[13px]"
              subtitle={session.preview || t('chat.noMessages')}
              titleTrailing={session.isFlagged ? <Flag className="h-3.5 w-3.5 text-info" /> : <span className="text-[11px] text-foreground/40">{formatTime(session.lastMessageAt)}</span>}
            />)}
            {section === 'skills' && skills.map((skill, index) => <EntityRow
              key={skill.slug}
              showSeparator={index > 0}
              isSelected={activeSkill?.slug === skill.slug}
              onClick={() => void selectSkill(skill)}
              icon={<Zap className="h-4 w-4 text-info" />}
              title={skill.metadata.name || skill.slug}
              subtitle={skill.metadata.description}
              trailing={<span className="text-[11px] text-foreground/40">{skill.source}</span>}
            />)}
            {section === 'settings' && <SettingsNavigator selectedSubpage={settingsPage} onSelectSubpage={page => setSettingsPage(page)} />}
          </div>
        </section>
        <div className="relative z-panel -mx-[3px] w-0 cursor-col-resize" onPointerDown={() => { resizeRef.current = 'list' }} />

        <main className="relative z-panel h-full min-w-[440px] flex-1 overflow-hidden rounded-[10px] bg-background shadow-middle">
          {section === 'sessions' && (activeSession ? <ChatPanel session={activeSession} workspaceId={workspaceId} onChanged={refreshSessions} onDeleted={() => { setActiveSessionId(''); setActiveSession(null); void refreshSessions() }} onBranched={branchSession} /> : <EmptyState title={t('session.newSession')} detail="Choose a session or create a new one." />)}
          {section === 'skills' && <SkillsPanel skill={activeSkill} files={skillFiles} workspaceId={workspaceId} onChanged={() => window.electronAPI.getSkills(workspaceId).then(setSkills)} onAgentEdit={skill => void startSkillMiniChat(skill)} />}
          {section === 'settings' && <SettingsPanel page={settingsPage} workspaces={workspaces} workspaceId={workspaceId} onWorkspacesChanged={() => void refreshWorkspaces()} />}
        </main>
        {miniSession && <div className="fixed inset-0 z-modal grid place-items-center bg-black/45 p-8"><div className="h-[min(720px,92vh)] w-[min(880px,100%)] overflow-hidden rounded-2xl border border-border bg-background shadow-modal-small"><div className="flex min-h-12 items-center justify-between border-b border-border px-3 py-2"><strong>{miniSession.name}</strong><AppButton onClick={() => setMiniSession(null)}>Close</AppButton></div><div className="h-[calc(100%-48px)]"><ChatPanel session={miniSession} workspaceId={workspaceId} onChanged={() => window.electronAPI.getSessionMessages(miniSession.id).then(setMiniSession)} onDeleted={() => setMiniSession(null)} onBranched={() => {}} /></div></div></div>}
      </div>
    </div>
  </TooltipProvider>
}
