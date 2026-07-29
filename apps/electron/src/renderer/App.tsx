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
import type { LlmConnectionWithStatus } from '@mkagent/shared/config'
import { i18n } from '@mkagent/shared/i18n'
import type { LoadedSkill } from '@mkagent/shared/skills'
import type { DeepLinkNavigation, FileAttachment, PermissionRequest, Session, SessionEvent, SkillFile } from '@mkagent/shared/protocol'
import { SessionViewer, TooltipProvider } from '@mkagent/ui'
import { useTranslation } from 'react-i18next'
import { Button } from './components/ui/button'
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
import { SessionMenu } from './components/app-shell/SessionMenu'
import { CraftChatInput } from './components/app-shell/input/CraftChatInput'
import { SkillMenu } from './components/app-shell/SkillMenu'
import SettingsNavigator from './pages/settings/SettingsNavigator'
import SkillInfoPage from './pages/SkillInfoPage'
import PreferencesPage from './pages/settings/PreferencesPage'
import AppSettingsPage from './pages/settings/AppSettingsPage'
import InputSettingsPage from './pages/settings/InputSettingsPage'
import { ThemeProvider } from './context/ThemeContext'
import AppearanceSettingsPage from './pages/settings/AppearanceSettingsPage'
import WorkspaceSettingsPage from './pages/settings/WorkspaceSettingsPage'
import PermissionsSettingsPage from './pages/settings/PermissionsSettingsPage'
import ShortcutsPage from './pages/settings/ShortcutsPage'
import AiSettingsPage from './pages/settings/AiSettingsPage'

type Section = 'sessions' | 'skills' | 'settings'
type SettingsPage = 'app' | 'ai' | 'appearance' | 'input' | 'workspace' | 'permissions' | 'shortcuts' | 'preferences'
type SessionFilter = 'all' | 'unread' | 'flagged' | 'running' | 'archived'
interface NavigationSnapshot { section: Section; settingsPage: SettingsPage; sessionFilter: SessionFilter; activeSessionId: string; activeSkillSlug: string }

const SETTINGS_PAGES: SettingsPage[] = ['app', 'ai', 'appearance', 'input', 'workspace', 'permissions', 'shortcuts', 'preferences']

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function formatRelativeTime(value: number) {
  const delta = value - Date.now()
  const seconds = Math.round(delta / 1000)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 7) return formatter.format(days, 'day')
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value)
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
      <CraftChatInput session={session} workspaceId={workspaceId} draft={draft} attachments={attachments} connections={connections} onDraftChange={setDraft} onAttachmentsChange={setAttachments} onAttach={() => void addAttachment()} onSend={() => void send()} onChanged={onChanged} />
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

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="flex h-full items-center justify-center text-muted-foreground"><p className="text-sm">{detail || title}</p></div>
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
  const [allSessionsExpanded, setAllSessionsExpanded] = useState(false)
  const [miniSession, setMiniSession] = useState<Session | null>(null)
  const refreshRef = useRef(0)
  const resizeRef = useRef<'navigation' | 'list' | null>(null)
  const applyingHistoryRef = useRef(false)
  const [navigationHistory, setNavigationHistory] = useState<NavigationSnapshot[]>([])
  const [navigationIndex, setNavigationIndex] = useState(-1)

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
    const snapshot: NavigationSnapshot = { section, settingsPage, sessionFilter, activeSessionId, activeSkillSlug: activeSkill?.slug || '' }
    if (applyingHistoryRef.current) { applyingHistoryRef.current = false; return }
    setNavigationHistory(current => {
      const previous = current[navigationIndex]
      if (previous && JSON.stringify(previous) === JSON.stringify(snapshot)) return current
      const next = [...current.slice(0, navigationIndex + 1), snapshot]
      setNavigationIndex(next.length - 1)
      return next
    })
  }, [activeSessionId, activeSkill?.slug, navigationIndex, section, sessionFilter, settingsPage])

  const moveHistory = useCallback(async (offset: -1 | 1) => {
    const nextIndex = navigationIndex + offset
    const snapshot = navigationHistory[nextIndex]
    if (!snapshot) return
    applyingHistoryRef.current = true
    setNavigationIndex(nextIndex)
    setSection(snapshot.section)
    setSettingsPage(snapshot.settingsPage)
    setSessionFilter(snapshot.sessionFilter)
    setActiveSessionId(snapshot.activeSessionId)
    setActiveSession(snapshot.activeSessionId ? await window.electronAPI.getSessionMessages(snapshot.activeSessionId) : null)
    const skill = skills.find(item => item.slug === snapshot.activeSkillSlug) || null
    setActiveSkill(skill)
    setSkillFiles(skill ? await window.electronAPI.getSkillFiles(workspaceId, skill.slug) : [])
  }, [navigationHistory, navigationIndex, skills, workspaceId])

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

  const startPreferencesMiniChat = async (preferencesPath: string) => {
    if (!workspaceId) return
    const created = await window.electronAPI.createSession(workspaceId, {
      name: 'Edit Preferences',
      systemPromptPreset: 'mini',
      hidden: true,
    })
    await window.electronAPI.sendMessage(created.id, `Help me edit my user preferences at \`${preferencesPath}\`. Review the file, ask what I want to change, and update it after I answer.`)
    setMiniSession(await window.electronAPI.getSessionMessages(created.id))
  }

  const importSessionFile = async (file: File | undefined) => {
    if (!file || !workspaceId) return
    const bundle = JSON.parse(await file.text())
    const imported = await window.electronAPI.importSession(workspaceId, bundle, 'fork')
    await refreshSessions()
    await selectSession(imported.id)
  }

  const filteredSessions = useMemo(() => sessions.filter(session => {
    if (session.hidden) return false
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
      expanded: allSessionsExpanded,
      onToggle: () => setAllSessionsExpanded(value => !value),
      contextMenu: { type: 'allSessions', onMarkAllRead: () => { void window.electronAPI.markAllSessionsRead(workspaceId).then(refreshSessions) } },
      items: [
        { id: 'nav:running', title: t('sidebar.running'), label: String(sessions.filter(session => session.isProcessing).length), icon: Zap, variant: section === 'sessions' && sessionFilter === 'running' ? 'default' : 'ghost', onClick: () => { setSection('sessions'); setSessionFilter('running') } },
        { id: 'separator:states-flagged', type: 'separator' },
        { id: 'nav:flagged', title: t('sidebar.flagged'), label: String(sessions.filter(session => session.isFlagged && !session.isArchived).length), icon: Flag, variant: section === 'sessions' && sessionFilter === 'flagged' ? 'default' : 'ghost', onClick: () => { setSection('sessions'); setSessionFilter('flagged') } },
        { id: 'nav:archived', title: t('sidebar.archived'), label: sessions.some(session => session.isArchived) ? String(sessions.filter(session => session.isArchived).length) : undefined, icon: Archive, variant: section === 'sessions' && sessionFilter === 'archived' ? 'default' : 'ghost', onClick: () => { setSection('sessions'); setSessionFilter('archived') } },
      ],
    },
    { id: 'separator:primary', type: 'separator' },
    { id: 'nav:skills', title: t('sidebar.skills'), label: String(skills.length), icon: Zap, variant: section === 'skills' ? 'default' : 'ghost', onClick: () => setSection('skills'), contextMenu: { type: 'skills', onAddSkill: () => { void startSkillMiniChat() } } },
    { id: 'separator:settings', type: 'separator' },
    { id: 'nav:settings', title: t('sidebar.settings'), icon: Settings, variant: section === 'settings' ? 'default' : 'ghost', onClick: () => setSection('settings') },
  ]

  return <ThemeProvider activeWorkspaceId={workspaceId || null}><TooltipProvider>
    <div className="h-screen w-screen overflow-hidden bg-background pt-[var(--topbar-height)] text-foreground">
      <TopBar
        workspaces={workspaces}
        activeWorkspaceId={workspaceId || null}
        onSelectWorkspace={async id => { setWorkspaceId(id); await window.electronAPI.switchWorkspace(id) }}
        onWorkspaceCreated={() => void refreshWorkspaces()}
        onWorkspaceRemoved={() => void refreshWorkspaces()}
        onNewChat={() => void newSession()}
        onBack={() => void moveHistory(-1)}
        onForward={() => void moveHistory(1)}
        canGoBack={navigationIndex > 0}
        canGoForward={navigationIndex >= 0 && navigationIndex < navigationHistory.length - 1}
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
            {section === 'sessions' && filteredSessions.length === 0 && <div className="flex h-full flex-col items-center justify-center px-8 text-center"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground/[0.04] text-muted-foreground"><Inbox className="h-5 w-5" /></div><div className="text-sm font-medium">{t('session.noSessionsYet')}</div><div className="mt-1 max-w-[240px] text-xs leading-relaxed text-muted-foreground">{t('session.noSessionsYetDesc')}</div><button onClick={() => void newSession()} className="mt-4 inline-flex h-7 items-center rounded-[8px] bg-background px-3 text-xs font-medium shadow-minimal transition-colors hover:bg-foreground/[0.03]">{t('session.newSession')}</button></div>}
            {section === 'sessions' && filteredSessions.map((session, index) => <EntityRow
              key={session.id}
              className="session-item"
              showSeparator={index > 0}
              separatorClassName="pl-[38px] pr-4"
              isSelected={activeSessionId === session.id}
              onClick={() => void selectSession(session.id)}
              menuContent={<SessionMenu session={session} onChanged={refreshSessions} onDeleted={() => { if (activeSessionId === session.id) { setActiveSessionId(''); setActiveSession(null) } void refreshSessions() }} />}
              icon={<div className="flex items-center gap-1">{session.isProcessing ? <Zap className="h-3.5 w-3.5 text-info" /> : <span className="h-3.5 w-3.5 rounded-full border border-foreground/30" />}{session.hasUnread && <span className="h-2 w-2 rounded-full bg-accent" />}</div>}
              title={session.name || t('session.newSession')}
              titleClassName="text-[13px]"
              subtitle={session.preview || t('chat.noMessages')}
              titleTrailing={session.isFlagged ? <Flag className="h-3.5 w-3.5 text-info" /> : <span className="text-[11px] text-foreground/40">{formatRelativeTime(session.lastMessageAt)}</span>}
            />)}
            {section === 'skills' && skills.map((skill, index) => <EntityRow
              key={skill.slug}
              showSeparator={index > 0}
              isSelected={activeSkill?.slug === skill.slug}
              onClick={() => void selectSkill(skill)}
              icon={<div className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-accent/10 text-accent"><Zap className="h-3.5 w-3.5" /></div>}
              title={skill.metadata.name || skill.slug}
              badges={<span className="truncate">{skill.metadata.description}</span>}
              menuContent={<SkillMenu skillSlug={skill.slug} skillName={skill.metadata.name || skill.slug} onOpenInNewWindow={() => void window.electronAPI.openUrl(`mkagent://skills/skill/${skill.slug}?window=focused`)} onShowInFinder={() => window.electronAPI.showInFolder(skill.path)} onDelete={skill.source === 'workspace' ? () => void window.electronAPI.deleteSkill(workspaceId, skill.slug).then(() => window.electronAPI.getSkills(workspaceId).then(setSkills)) : undefined} canDelete={skill.source === 'workspace'} />}
            />)}
            {section === 'settings' && <SettingsNavigator selectedSubpage={settingsPage} onSelectSubpage={page => setSettingsPage(page)} />}
          </div>
        </section>
        <div className="relative z-panel -mx-[3px] w-0 cursor-col-resize" onPointerDown={() => { resizeRef.current = 'list' }} />

        <main className="relative z-panel h-full min-w-[440px] flex-1 overflow-hidden rounded-[10px] bg-background shadow-middle">
          {section === 'sessions' && (activeSession ? <ChatPanel session={activeSession} workspaceId={workspaceId} onChanged={refreshSessions} onDeleted={() => { setActiveSessionId(''); setActiveSession(null); void refreshSessions() }} onBranched={branchSession} /> : <EmptyState title={t('session.noSessionSelected')} detail={t('session.noSessionSelected')} />)}
          {section === 'skills' && <SkillInfoPage skill={activeSkill} files={skillFiles} workspaceId={workspaceId} onChanged={() => window.electronAPI.getSkills(workspaceId).then(setSkills)} onAgentEdit={skill => void startSkillMiniChat(skill)} />}
          {section === 'settings' && (settingsPage === 'preferences' ? <PreferencesPage onAgentEdit={path => void startPreferencesMiniChat(path)} /> : settingsPage === 'app' ? <AppSettingsPage /> : settingsPage === 'input' ? <InputSettingsPage /> : settingsPage === 'appearance' ? <AppearanceSettingsPage /> : settingsPage === 'workspace' ? <WorkspaceSettingsPage workspace={workspaces.find(workspace => workspace.id === workspaceId)} /> : settingsPage === 'permissions' ? <PermissionsSettingsPage workspaceId={workspaceId} /> : settingsPage === 'shortcuts' ? <ShortcutsPage /> : <AiSettingsPage workspaceId={workspaceId} />)}
        </main>
        {miniSession && <div className="fixed inset-0 z-modal grid place-items-center bg-black/45 p-8"><div className="h-[min(720px,92vh)] w-[min(880px,100%)] overflow-hidden rounded-2xl border border-border bg-background shadow-modal-small"><div className="flex min-h-12 items-center justify-between border-b border-border px-3 py-2"><strong>{miniSession.name}</strong><AppButton onClick={() => setMiniSession(null)}>Close</AppButton></div><div className="h-[calc(100%-48px)]"><ChatPanel session={miniSession} workspaceId={workspaceId} onChanged={() => window.electronAPI.getSessionMessages(miniSession.id).then(setMiniSession)} onDeleted={() => setMiniSession(null)} onBranched={() => {}} /></div></div></div>}
      </div>
    </div>
  </TooltipProvider></ThemeProvider>
}
