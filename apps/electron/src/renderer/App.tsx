import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Box,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Flag,
  FolderKanban,
  MessageSquareText,
  MoreHorizontal,
  Palette,
  PanelLeft,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  Wifi,
  Zap,
} from 'lucide-react'
import type { AnnotationV1, StoredSession, Workspace } from '@mkagent/core/types'
import type { LlmConnectionWithStatus, NetworkProxySettings } from '@mkagent/shared/config'
import { i18n } from '@mkagent/shared/i18n'
import type { LoadedSkill } from '@mkagent/shared/skills'
import type { DeepLinkNavigation, FileAttachment, PermissionRequest, Session, SessionEvent, SkillFile, WorkspaceSettings } from '@mkagent/shared/protocol'
import { Markdown, SessionViewer } from '@mkagent/ui'
import { Button } from './components/ui/button'
import { SettingsCard as CraftSettingsCard, SettingsCardContent } from './components/settings/SettingsCard'
import mkagentIcon from './assets/mkagent_app_icon.png'

type Section = 'sessions' | 'skills' | 'settings'
type SettingsPage = 'connections' | 'permissions' | 'proxy' | 'workspaces' | 'appearance' | 'language' | 'updates'
type SessionFilter = 'all' | 'unread' | 'flagged' | 'running' | 'archived'

const SETTINGS_PAGES: SettingsPage[] = ['connections', 'permissions', 'proxy', 'workspaces', 'appearance', 'language', 'updates']

const SETTINGS_META: Record<SettingsPage, { title: string; description: string; icon: typeof Settings }> = {
  connections: { title: 'AI & Connections', description: 'Models, providers, and API keys', icon: Sparkles },
  permissions: { title: 'Permissions', description: 'Tool access and approval behavior', icon: ShieldCheck },
  proxy: { title: 'App', description: 'Network proxy and application behavior', icon: Wifi },
  workspaces: { title: 'Workspace', description: 'Local workspaces and data isolation', icon: FolderKanban },
  appearance: { title: 'Appearance', description: 'Theme, color, and interface', icon: Palette },
  language: { title: 'Preferences', description: 'Language and personal preferences', icon: UserRound },
  updates: { title: 'Updates', description: 'Version and update channel', icon: Zap },
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value)
}

function AppButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const primary = props.className?.split(' ').includes('primary')
  return <Button {...props} variant={primary ? 'default' : 'outline'} size="sm" className={cx('mk-button', props.className)} />
}

function ChatPanel({ session, workspaceId, onChanged, onDeleted, onBranched }: {
  session: Session
  workspaceId: string
  onChanged: () => void
  onDeleted: () => void
  onBranched: (messageId: string, newPanel?: boolean) => void
}) {
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
    <div className="mk-composer-wrap">
      {permission && (
        <div className="mk-permission">
          <div><strong>{permission.toolName}</strong><span>{permission.description ?? permission.command}</span></div>
          <div className="mk-row"><AppButton onClick={() => respond(false)}>Deny</AppButton><AppButton onClick={() => respond(true)}>Allow</AppButton><AppButton onClick={() => respond(true, true)}>Always allow</AppButton></div>
        </div>
      )}
      {attachments.length > 0 && <div className="mk-chips">{attachments.map(item => <span key={item.path}>{item.name}</span>)}</div>}
      <div className="mk-composer">
        <textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          placeholder="Ask MkAgent…"
        />
        <div className="mk-row mk-composer-actions">
          <AppButton onClick={addAttachment}>Attach</AppButton>
          {session.isProcessing
            ? <AppButton onClick={() => window.electronAPI.cancelProcessing(session.id).then(onChanged)}>Stop</AppButton>
            : <AppButton className="primary" onClick={send}>Send</AppButton>}
        </div>
      </div>
    </div>
  )

  const header = (
    <div className="mk-chat-header">
      <div><strong>{session.name || 'New session'}</strong><span>{session.currentStatus?.message ?? (session.isProcessing ? 'Processing' : 'Idle')}</span></div>
      <div className="mk-row mk-chat-actions">
        <select
          value={session.llmConnection ?? ''}
          onChange={event => window.electronAPI.sessionCommand(session.id, { type: 'setConnection', connectionSlug: event.target.value }).then(onChanged)}
        >
          <option value="">Default connection</option>
          {connections.map(connection => <option key={connection.slug} value={connection.slug}>{connection.name}</option>)}
        </select>
        <select value={session.model ?? ''} onChange={event => window.electronAPI.setSessionModel(session.id, workspaceId, event.target.value || null, selectedConnection?.slug).then(onChanged)}>
          <option value="">Default model</option>
          {modelOptions.map(model => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}
        </select>
        <select value={session.permissionMode ?? 'safe'} onChange={event => window.electronAPI.sessionCommand(session.id, { type: 'setPermissionMode', mode: event.target.value as 'safe' | 'ask' | 'allow-all' }).then(onChanged)}>
          <option value="safe">Safe</option><option value="ask">Ask</option><option value="allow-all">Allow all</option>
        </select>
        <select value={session.thinkingLevel ?? 'medium'} onChange={event => window.electronAPI.sessionCommand(session.id, { type: 'setThinkingLevel', level: event.target.value as 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' }).then(onChanged)}>
          <option value="off">Thinking off</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">Extra high</option><option value="max">Maximum</option>
        </select>
        <AppButton title="Open Browser" onClick={() => window.electronAPI.browserPane.create(session.id)}>Browser</AppButton>
        <AppButton title="Flag" onClick={() => window.electronAPI.sessionCommand(session.id, { type: session.isFlagged ? 'unflag' : 'flag' }).then(onChanged)}>{session.isFlagged ? 'Unflag' : 'Flag'}</AppButton>
        <AppButton title="Archive" onClick={() => window.electronAPI.sessionCommand(session.id, { type: session.isArchived ? 'unarchive' : 'archive' }).then(onChanged)}>{session.isArchived ? 'Restore' : 'Archive'}</AppButton>
        <AppButton title="Open in new window" onClick={() => window.electronAPI.openSessionInNewWindow(workspaceId, session.id)}>Window</AppButton>
        <AppButton title="Export" onClick={exportCurrentSession}>Export</AppButton>
        <AppButton title="Rename" onClick={() => { const name = window.prompt('Session name', session.name ?? ''); if (name?.trim()) void window.electronAPI.sessionCommand(session.id, { type: 'rename', name: name.trim() }).then(onChanged) }}>Rename</AppButton>
        <AppButton title="Delete" onClick={() => { if (window.confirm('Delete this session?')) void window.electronAPI.deleteSession(session.id).then(onDeleted) }}>Delete</AppButton>
      </div>
    </div>
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
    <div className="mk-document">
      <div className="mk-document-header"><div><strong>{skill.metadata.name || skill.slug}</strong><span>{skill.source}</span></div><div className="mk-row"><AppButton onClick={() => onAgentEdit(skill)}>Edit with agent</AppButton><AppButton onClick={() => window.electronAPI.openSkillInEditor(workspaceId, skill.slug)}>Editor</AppButton><AppButton onClick={() => window.electronAPI.openSkillInFinder(workspaceId, skill.slug)}>Folder</AppButton><AppButton onClick={() => { if (window.confirm(`Delete ${skill.slug}?`)) void window.electronAPI.deleteSkill(workspaceId, skill.slug).then(onChanged) }}>Delete</AppButton></div></div>
      <Markdown>{skill.content}</Markdown>
      {files.length > 0 && <div className="mk-files"><strong>Files</strong>{files.map(file => <span key={file.name}>{file.name}</span>)}</div>}
    </div>
  )
}

function SettingsPanel({ page, workspaces, workspaceId, onWorkspacesChanged }: { page: SettingsPage; workspaces: Workspace[]; workspaceId: string; onWorkspacesChanged: () => void }) {
  const [connections, setConnections] = useState<LlmConnectionWithStatus[]>([])
  const [proxy, setProxy] = useState<NetworkProxySettings>({ enabled: false })
  const [form, setForm] = useState({ name: '', provider: 'openai', apiKey: '', baseUrl: '', model: '', protocol: 'openai-completions' as 'openai-completions' | 'anthropic-messages' })
  const [message, setMessage] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>({})
  const reloadConnections = useCallback(() => window.electronAPI.listLlmConnectionsWithStatus().then(setConnections), [])

  useEffect(() => {
    if (page === 'connections') void reloadConnections()
    if (page === 'proxy') void window.electronAPI.getNetworkProxySettings().then(setProxy)
    if (page === 'permissions' && workspaceId) void window.electronAPI.getWorkspaceSettings(workspaceId).then(settings => setWorkspaceSettings(settings ?? {}))
  }, [page, reloadConnections, workspaceId])

  if (page === 'connections') {
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
    return <SettingsCard title="Connections / Models" detail="API-key providers, compatible endpoints, and local Ollama models.">
      <div className="mk-stack">{connections.map(connection => <div className="mk-setting-row" key={connection.slug}><div><strong>{connection.name}</strong><span>{connection.defaultModel ?? connection.piAuthProvider ?? connection.baseUrl}</span></div><div className="mk-row"><span className={connection.isAuthenticated || connection.authType === 'none' ? 'mk-ok' : 'mk-warn'}>{connection.isDefault ? 'Default' : connection.isAuthenticated ? 'Ready' : 'Needs key'}</span><AppButton onClick={() => window.electronAPI.setDefaultLlmConnection(connection.slug).then(reloadConnections)}>Use</AppButton><AppButton onClick={() => window.electronAPI.deleteLlmConnection(connection.slug).then(reloadConnections)}>Delete</AppButton></div></div>)}</div>
      <div className="mk-form-grid">
        <input placeholder="Connection name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
        <input placeholder="Provider preset (openai, google…)" value={form.provider} onChange={event => setForm({ ...form, provider: event.target.value })} />
        <input type="password" placeholder="API key (optional for Ollama)" value={form.apiKey} onChange={event => setForm({ ...form, apiKey: event.target.value })} />
        <input placeholder="Base URL (e.g. http://localhost:11434/v1)" value={form.baseUrl} onChange={event => setForm({ ...form, baseUrl: event.target.value })} />
        <input placeholder="Default model" value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} />
        <select value={form.protocol} onChange={event => setForm({ ...form, protocol: event.target.value as typeof form.protocol })}><option value="openai-completions">OpenAI Completions</option><option value="anthropic-messages">Anthropic Messages</option></select>
      </div>
      <div className="mk-row"><AppButton className="primary" onClick={save}>Save connection</AppButton><span>{message}</span></div>
    </SettingsCard>
  }

  if (page === 'proxy') return <SettingsCard title="Network Proxy" detail="Use the system network configuration or configure HTTP(S) proxies for model and web requests.">
    <label className="mk-row"><input type="checkbox" checked={proxy.enabled} onChange={event => setProxy({ ...proxy, enabled: event.target.checked })} /> Custom proxy</label>
    {proxy.enabled && <><input placeholder="HTTP proxy" value={proxy.httpProxy ?? ''} onChange={event => setProxy({ ...proxy, httpProxy: event.target.value })} /><input placeholder="HTTPS proxy" value={proxy.httpsProxy ?? ''} onChange={event => setProxy({ ...proxy, httpsProxy: event.target.value })} /><input placeholder="No proxy (comma separated)" value={proxy.noProxy ?? ''} onChange={event => setProxy({ ...proxy, noProxy: event.target.value })} /></>}
    <AppButton className="primary" onClick={() => window.electronAPI.setNetworkProxySettings(proxy).then(() => setMessage('Saved.'))}>Save</AppButton><span>{message}</span>
  </SettingsCard>

  if (page === 'workspaces') return <SettingsCard title="Workspaces" detail="Local workspaces isolate sessions, Skills, permissions, and Views.">
    {workspaces.map(workspace => <div className="mk-setting-row" key={workspace.id}><div><strong>{workspace.name}</strong><span>{workspace.slug}</span></div><code>{workspace.rootPath}</code></div>)}
    <div className="mk-row"><input placeholder="Workspace name" value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} /><AppButton className="primary" onClick={async () => {
      const folder = await window.electronAPI.openFolderDialog()
      if (!folder || !workspaceName.trim()) return
      await window.electronAPI.createWorkspace(folder, workspaceName.trim())
      setWorkspaceName('')
      onWorkspacesChanged()
    }}>Create from folder</AppButton></div>
  </SettingsCard>
  if (page === 'appearance') return <SettingsCard title="Appearance" detail="Light, dark, and system appearance use the shared design tokens."><div className="mk-row">{['light', 'dark', 'system'].map(theme => <AppButton key={theme} onClick={() => { document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)); void window.electronAPI.setColorTheme(theme) }}>{theme}</AppButton>)}</div></SettingsCard>
  if (page === 'language') return <SettingsCard title="Language" detail="MkAgent MVP maintains English and Simplified Chinese."><div className="mk-row"><AppButton onClick={() => i18n.changeLanguage('en')}>English</AppButton><AppButton onClick={() => i18n.changeLanguage('zh-Hans')}>简体中文</AppButton></div></SettingsCard>
  if (page === 'updates') return <SettingsCard title="Updates" detail="Desktop releases are downloaded from open-fox/mkagent-public."><AppButton onClick={async () => { const info = await window.electronAPI.checkForUpdates(); setMessage(info.available ? `Version ${info.latestVersion} is available.` : `MkAgent ${info.currentVersion} is up to date.`) }}>Check for updates</AppButton><span>{message}</span></SettingsCard>
  return <SettingsCard title="Permissions" detail="Workspace permission modes are enforced by Pi and can be changed in each session header.">
    <label className="mk-stack"><span>Default permission mode</span><select value={workspaceSettings.permissionMode ?? 'safe'} onChange={async event => {
      const permissionMode = event.target.value as NonNullable<WorkspaceSettings['permissionMode']>
      setWorkspaceSettings(current => ({ ...current, permissionMode }))
      await window.electronAPI.updateWorkspaceSetting(workspaceId, 'permissionMode', permissionMode)
    }}><option value="safe">Safe</option><option value="ask">Ask</option><option value="allow-all">Allow all</option></select></label>
    <p>Safe, ask, and allow-all modes use the shared command, path, Browser, and network policy.</p>
  </SettingsCard>
}

function SettingsCard({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return <div className="mk-settings-page">
    <div className="mk-settings-title"><h1>{title}</h1><p>{detail}</p></div>
    <CraftSettingsCard divided={false}>
      <SettingsCardContent className="mk-stack">{children}</SettingsCardContent>
    </CraftSettingsCard>
  </div>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="mk-empty"><img src={mkagentIcon} alt="" /><strong>{title}</strong><span>{detail}</span></div>
}

export default function App() {
  const [section, setSection] = useState<Section>('sessions')
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('connections')
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
  const [panelWidths, setPanelWidths] = useState({ navigation: 188, list: 300 })
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
        setPanelWidths(current => ({ ...current, navigation: Math.min(280, Math.max(148, event.clientX)) }))
      } else if (resizeRef.current === 'list') {
        setPanelWidths(current => ({ ...current, list: Math.min(520, Math.max(220, event.clientX - current.navigation)) }))
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

  const navItems: Array<{ id: Section; label: string; icon: typeof Settings }> = [
    { id: 'sessions', label: 'All Sessions', icon: MessageSquareText },
    { id: 'skills', label: 'Skills', icon: Sparkles },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]
  const sectionTitle = section === 'sessions' ? 'All Sessions' : section === 'skills' ? 'Skills' : 'Settings'

  return <div className="mk-app-frame">
    <header className="mk-topbar">
      <div className="mk-topbar-brand">
        <img src={mkagentIcon} alt="MkAgent" />
        <button className="mk-topbar-workspace">
          <span>{workspaces.find(item => item.id === workspaceId)?.name ?? 'default'}</span>
          <ChevronDown />
        </button>
      </div>
      <div className="mk-topbar-actions">
        <button title="Toggle sidebar"><PanelLeft /></button>
        <button title="Help"><CircleHelp /></button>
      </div>
    </header>
    <div className="mk-shell">
      <aside className="mk-panel mk-nav" style={{ width: panelWidths.navigation }}>
        <div className="mk-nav-content">
          <button className="mk-new" onClick={newSession}><Plus /><span>New Session</span></button>
          <nav>{navItems.map(item => {
            const Icon = item.icon
            return <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}><Icon /><span>{item.label}</span>{item.id === 'sessions' && sessions.filter(value => value.hasUnread).length > 0 && <small>{sessions.filter(value => value.hasUnread).length}</small>}</button>
          })}</nav>
        </div>
        <div className="mk-nav-footer">
          <label>Workspace</label>
          <select value={workspaceId} onChange={async event => { setWorkspaceId(event.target.value); await window.electronAPI.switchWorkspace(event.target.value) }}>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>
        </div>
      </aside>
      <div className="mk-resizer" onPointerDown={() => { resizeRef.current = 'navigation' }} />
      <section className="mk-panel mk-list-pane" style={{ width: panelWidths.list }}>
        <div className="mk-panel-header">
          <strong>{sectionTitle}</strong>
          <div className="mk-row">
            {section === 'skills' && <button className="mk-icon-button" title="Create Skill with agent" onClick={() => startSkillMiniChat()}><Plus /></button>}
            {section === 'sessions' && <label className="mk-icon-button mk-file-button" title="Import session"><Upload /><input type="file" accept="application/json,.json" onChange={event => { void importSessionFile(event.target.files?.[0]); event.target.value = '' }} /></label>}
            <button className="mk-icon-button" title="More"><MoreHorizontal /></button>
          </div>
        </div>
        {section === 'sessions' && <div className="mk-list-tools">
          <label className="mk-search"><Search /><input placeholder="Search sessions" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <div className="mk-filters">{(['all', 'unread', 'flagged', 'running', 'archived'] as SessionFilter[]).map(filter => <button key={filter} className={sessionFilter === filter ? 'active' : ''} title={filter} onClick={() => setSessionFilter(filter)}>{filter === 'all' ? <Box /> : filter === 'unread' ? <MessageSquareText /> : filter === 'flagged' ? <Flag /> : filter === 'running' ? <CheckCircle2 /> : <Archive />}</button>)}</div>
        </div>}
        <div className="mk-list">
          {section === 'sessions' && <div className="mk-list-group-title">{sessionFilter === 'archived' ? 'Archived' : 'Recent'}</div>}
          {section === 'sessions' && filteredSessions.map(session => <button key={session.id} className={activeSessionId === session.id ? 'active' : ''} onClick={() => selectSession(session.id)}><div className="mk-list-row-title"><strong>{session.name || 'New session'}</strong>{session.isFlagged && <Flag />}{session.hasUnread && <i />}</div><span>{session.preview || 'No messages yet'}</span><small>{session.isProcessing ? 'Running · ' : session.isArchived ? 'Archived · ' : ''}{formatTime(session.lastMessageAt)}</small></button>)}
          {section === 'skills' && skills.map(skill => <button key={skill.slug} className={activeSkill?.slug === skill.slug ? 'active' : ''} onClick={() => selectSkill(skill)}><div className="mk-skill-icon"><Sparkles /></div><div><strong>{skill.metadata.name || skill.slug}</strong><span>{skill.metadata.description}</span><small>{skill.source}</small></div></button>)}
          {section === 'settings' && SETTINGS_PAGES.map(page => {
            const meta = SETTINGS_META[page]
            const Icon = meta.icon
            return <button key={page} className={settingsPage === page ? 'active' : ''} onClick={() => setSettingsPage(page)}><div className="mk-settings-row-icon"><Icon /></div><div><strong>{meta.title}</strong><span>{meta.description}</span></div></button>
          })}
        </div>
      </section>
      <div className="mk-resizer" onPointerDown={() => { resizeRef.current = 'list' }} />
      <main className="mk-panel mk-main">
        {section === 'sessions' && (activeSession ? <ChatPanel session={activeSession} workspaceId={workspaceId} onChanged={refreshSessions} onDeleted={() => { setActiveSessionId(''); setActiveSession(null); void refreshSessions() }} onBranched={branchSession} /> : <EmptyState title="Start a session" detail="Choose a session or create a new one." />)}
        {section === 'skills' && <SkillsPanel skill={activeSkill} files={skillFiles} workspaceId={workspaceId} onChanged={() => window.electronAPI.getSkills(workspaceId).then(setSkills)} onAgentEdit={skill => void startSkillMiniChat(skill)} />}
        {section === 'settings' && <SettingsPanel page={settingsPage} workspaces={workspaces} workspaceId={workspaceId} onWorkspacesChanged={() => void refreshWorkspaces()} />}
      </main>
      {miniSession && <div className="mk-modal-backdrop"><div className="mk-mini-chat"><div className="mk-modal-header"><strong>{miniSession.name}</strong><AppButton onClick={() => setMiniSession(null)}>Close</AppButton></div><ChatPanel session={miniSession} workspaceId={workspaceId} onChanged={() => window.electronAPI.getSessionMessages(miniSession.id).then(setMiniSession)} onDeleted={() => setMiniSession(null)} onBranched={() => {}} /></div></div>}
    </div>
  </div>
}
