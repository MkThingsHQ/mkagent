import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StoredSession, Workspace } from '@mkagent/core/types'
import type { LlmConnectionWithStatus, NetworkProxySettings } from '@mkagent/shared/config'
import { i18n } from '@mkagent/shared/i18n'
import type { LoadedSkill } from '@mkagent/shared/skills'
import type { DeepLinkNavigation, FileAttachment, PermissionRequest, Session, SessionEvent, SkillFile } from '@mkagent/shared/protocol'
import { Markdown, SessionViewer } from '@mkagent/ui'

type Section = 'sessions' | 'skills' | 'settings'
type SettingsPage = 'connections' | 'permissions' | 'proxy' | 'workspaces' | 'appearance' | 'language' | 'updates'
type SessionFilter = 'all' | 'unread' | 'flagged' | 'running' | 'archived'

const SETTINGS_PAGES: SettingsPage[] = ['connections', 'permissions', 'proxy', 'workspaces', 'appearance', 'language', 'updates']

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value)
}

function AppButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={cx('mk-button', props.className)} />
}

function ChatPanel({ session, workspaceId, onChanged }: { session: Session; workspaceId: string; onChanged: () => void }) {
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [permission, setPermission] = useState<PermissionRequest | null>(null)
  const [connections, setConnections] = useState<LlmConnectionWithStatus[]>([])

  useEffect(() => {
    void window.electronAPI.listLlmConnectionsWithStatus().then(setConnections)
    return window.electronAPI.onSessionEvent((event: SessionEvent) => {
      if (event.sessionId !== session.id) return
      if (event.type === 'permission_request') setPermission(event.request)
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
      <select
        value={session.llmConnection ?? ''}
        onChange={event => window.electronAPI.sessionCommand(session.id, { type: 'setConnection', connectionSlug: event.target.value }).then(onChanged)}
      >
        <option value="">Default connection</option>
        {connections.map(connection => <option key={connection.slug} value={connection.slug}>{connection.name}</option>)}
      </select>
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
    />
  )
}

function SkillsPanel({ skill, files }: { skill: LoadedSkill | null; files: SkillFile[] }) {
  if (!skill) return <EmptyState title="Select a Skill" detail="Skills are discovered globally, per workspace, and from the current working directory." />
  return (
    <div className="mk-document">
      <div className="mk-document-header"><div><strong>{skill.metadata.name || skill.slug}</strong><span>{skill.source}</span></div></div>
      <Markdown>{skill.content}</Markdown>
      {files.length > 0 && <div className="mk-files"><strong>Files</strong>{files.map(file => <span key={file.name}>{file.name}</span>)}</div>}
    </div>
  )
}

function SettingsPanel({ page, workspaces }: { page: SettingsPage; workspaces: Workspace[] }) {
  const [connections, setConnections] = useState<LlmConnectionWithStatus[]>([])
  const [proxy, setProxy] = useState<NetworkProxySettings>({ enabled: false })
  const [form, setForm] = useState({ name: '', provider: 'openai', apiKey: '', baseUrl: '', model: '', protocol: 'openai-completions' as 'openai-completions' | 'anthropic-messages' })
  const [message, setMessage] = useState('')
  const reloadConnections = useCallback(() => window.electronAPI.listLlmConnectionsWithStatus().then(setConnections), [])

  useEffect(() => {
    if (page === 'connections') void reloadConnections()
    if (page === 'proxy') void window.electronAPI.getNetworkProxySettings().then(setProxy)
  }, [page, reloadConnections])

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

  if (page === 'workspaces') return <SettingsCard title="Workspaces" detail="Local workspaces isolate sessions, Skills, permissions, and Views.">{workspaces.map(workspace => <div className="mk-setting-row" key={workspace.id}><div><strong>{workspace.name}</strong><span>{workspace.slug}</span></div><code>{workspace.rootPath}</code></div>)}</SettingsCard>
  if (page === 'appearance') return <SettingsCard title="Appearance" detail="Light, dark, and system appearance use the shared design tokens."><div className="mk-row">{['light', 'dark', 'system'].map(theme => <AppButton key={theme} onClick={() => { document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)); void window.electronAPI.setColorTheme(theme) }}>{theme}</AppButton>)}</div></SettingsCard>
  if (page === 'language') return <SettingsCard title="Language" detail="MkAgent MVP maintains English and Simplified Chinese."><div className="mk-row"><AppButton onClick={() => i18n.changeLanguage('en')}>English</AppButton><AppButton onClick={() => i18n.changeLanguage('zh-Hans')}>简体中文</AppButton></div></SettingsCard>
  if (page === 'updates') return <SettingsCard title="Updates" detail="Desktop releases are downloaded from open-fox/mkagent-public."><AppButton onClick={async () => { const info = await window.electronAPI.checkForUpdates(); setMessage(info.available ? `Version ${info.latestVersion} is available.` : `MkAgent ${info.currentVersion} is up to date.`) }}>Check for updates</AppButton><span>{message}</span></SettingsCard>
  return <SettingsCard title="Permissions" detail="Workspace permission modes are enforced by Pi and can be changed in each session header."><p>Safe, ask, and allow-all modes remain aligned with the shared permission engine.</p></SettingsCard>
}

function SettingsCard({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return <div className="mk-settings-card"><h2>{title}</h2><p>{detail}</p><div className="mk-stack">{children}</div></div>
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="mk-empty"><img src="/favicon.svg" alt="" /><strong>{title}</strong><span>{detail}</span></div>
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
  const refreshRef = useRef(0)

  const refreshSessions = useCallback(async () => {
    const current = ++refreshRef.current
    const next = await window.electronAPI.getSessions()
    if (current !== refreshRef.current) return
    setSessions(next.filter(session => !workspaceId || session.workspaceId === workspaceId))
    if (activeSessionId) setActiveSession(await window.electronAPI.getSessionMessages(activeSessionId))
  }, [activeSessionId, workspaceId])

  useEffect(() => {
    void (async () => {
      const available = await window.electronAPI.getWorkspaces()
      const selected = await window.electronAPI.getWindowWorkspace()
      setWorkspaces(available)
      setWorkspaceId(selected ?? available[0]?.id ?? '')
    })()
  }, [])

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

  const filteredSessions = useMemo(() => sessions.filter(session => {
    const haystack = `${session.name ?? ''} ${session.preview ?? ''}`.toLowerCase()
    const matchesFilter = sessionFilter === 'all' ? !session.isArchived
      : sessionFilter === 'unread' ? Boolean(session.hasUnread) && !session.isArchived
        : sessionFilter === 'flagged' ? Boolean(session.isFlagged) && !session.isArchived
          : sessionFilter === 'running' ? Boolean(session.isProcessing) && !session.isArchived
            : Boolean(session.isArchived)
    return matchesFilter && haystack.includes(query.toLowerCase())
  }), [query, sessionFilter, sessions])

  return <div className="mk-shell">
    <aside className="mk-nav">
      <button className="mk-new" onClick={newSession}>＋ <span>New session</span></button>
      <nav>{(['sessions', 'skills', 'settings'] as Section[]).map(item => <button key={item} className={section === item ? 'active' : ''} onClick={() => setSection(item)}>{item === 'sessions' ? '◫' : item === 'skills' ? '✦' : '⚙'} <span>{item}</span></button>)}</nav>
      <select value={workspaceId} onChange={async event => { setWorkspaceId(event.target.value); await window.electronAPI.switchWorkspace(event.target.value) }}>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>
    </aside>
    <section className="mk-list-pane">
      <div className="mk-list-header"><strong>{section[0].toUpperCase() + section.slice(1)}</strong>{section === 'sessions' && <><input placeholder="Search sessions" value={query} onChange={event => setQuery(event.target.value)} /><div className="mk-row mk-filters">{(['all', 'unread', 'flagged', 'running', 'archived'] as SessionFilter[]).map(filter => <AppButton key={filter} className={sessionFilter === filter ? 'active' : ''} onClick={() => setSessionFilter(filter)}>{filter}</AppButton>)}</div></>}</div>
      <div className="mk-list">
        {section === 'sessions' && filteredSessions.map(session => <button key={session.id} className={activeSessionId === session.id ? 'active' : ''} onClick={() => selectSession(session.id)}><strong>{session.isFlagged ? '★ ' : ''}{session.name || 'New session'}</strong><span>{session.preview || 'No messages yet'}</span><small>{session.isArchived ? 'Archived · ' : ''}{session.hasUnread ? 'Unread · ' : ''}{formatTime(session.lastMessageAt)}</small></button>)}
        {section === 'skills' && skills.map(skill => <button key={skill.slug} className={activeSkill?.slug === skill.slug ? 'active' : ''} onClick={() => selectSkill(skill)}><strong>{skill.metadata.name || skill.slug}</strong><span>{skill.metadata.description}</span><small>{skill.source}</small></button>)}
        {section === 'settings' && SETTINGS_PAGES.map(page => <button key={page} className={settingsPage === page ? 'active' : ''} onClick={() => setSettingsPage(page)}><strong>{page[0].toUpperCase() + page.slice(1)}</strong></button>)}
      </div>
    </section>
    <main className="mk-main">
      {section === 'sessions' && (activeSession ? <ChatPanel session={activeSession} workspaceId={workspaceId} onChanged={refreshSessions} /> : <EmptyState title="Start a session" detail="Choose a session or create a new one." />)}
      {section === 'skills' && <SkillsPanel skill={activeSkill} files={skillFiles} />}
      {section === 'settings' && <SettingsPanel page={settingsPage} workspaces={workspaces} />}
    </main>
  </div>
}
