import { useCallback, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Check, ChevronDown, ExternalLink, FolderPlus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from '@/components/ui/styled-dropdown'
import { WorkspaceCreationScreen } from '@/components/workspace'
import type { Workspace } from '../../../shared/types'

interface WorkspaceSwitcherProps {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onSelect: (workspaceId: string, openInNewWindow?: boolean) => void | Promise<void>
  onWorkspaceCreated?: (workspace: Workspace) => void
  onWorkspaceRemoved?: () => void
}

function WorkspaceAvatar({ workspace, className }: { workspace?: Workspace; className?: string }) {
  return <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-accent/12 font-medium text-accent ring-1 ring-border/50', className)}>{workspace?.name?.charAt(0)?.toUpperCase() || 'W'}</span>
}

export function WorkspaceSwitcher({ workspaces, activeWorkspaceId, onSelect, onWorkspaceCreated, onWorkspaceRemoved }: WorkspaceSwitcherProps) {
  const { t } = useTranslation()
  const [showCreationScreen, setShowCreationScreen] = useState(false)
  const selectedWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId)

  const handleRemoveWorkspace = useCallback(async (workspace: Workspace) => {
    if (workspace.id === activeWorkspaceId) return
    if (await window.electronAPI.removeWorkspace(workspace.id)) onWorkspaceRemoved?.()
  }, [activeWorkspaceId, onWorkspaceRemoved])

  return <>
    <AnimatePresence>{showCreationScreen && <WorkspaceCreationScreen onClose={() => setShowCreationScreen(false)} onWorkspaceCreated={workspace => { setShowCreationScreen(false); onWorkspaceCreated?.(workspace); void onSelect(workspace.id) }} />}</AnimatePresence>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" data-workspace-switcher="topbar" className="header-icon-btn titlebar-no-drag ml-1 flex h-[30px] min-w-0 flex-1 items-center justify-start gap-0.5 rounded-[8px] border border-foreground/6 px-3 text-[13px] text-foreground/50 transition-colors hover:bg-foreground/5 hover:text-foreground data-[state=open]:bg-foreground/5 data-[state=open]:text-foreground" aria-label={t('workspace.selectWorkspace')}>
          <WorkspaceAvatar workspace={selectedWorkspace} className="mr-1.5 h-4 w-4 text-[9px]" />
          <span className="min-w-0 flex-1 truncate text-left">{selectedWorkspace?.name || 'Workspace'}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <StyledDropdownMenuContent align="center" sideOffset={6} minWidth="min-w-64">
        {workspaces.map(workspace => <StyledDropdownMenuItem key={workspace.id} onClick={event => void onSelect(workspace.id, event.metaKey || event.ctrlKey)} className={cn('group justify-between', activeWorkspaceId === workspace.id && 'bg-foreground/10')}>
          <div className="flex min-w-0 flex-1 items-center gap-3 font-sans"><WorkspaceAvatar workspace={workspace} className="h-5 w-5 text-[10px]" /><span className="truncate">{workspace.name}</span></div>
          <div className="flex items-center gap-1">
            {activeWorkspaceId !== workspace.id && <button data-touch-reveal="true" className="rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100" onClick={event => { event.stopPropagation(); void handleRemoveWorkspace(workspace) }} title={t('workspace.removeWorkspace')}><Trash2 className="h-3.5 w-3.5" /></button>}
            {activeWorkspaceId !== workspace.id && <button data-touch-reveal="true" className="rounded p-0.5 opacity-0 transition-opacity hover:bg-foreground/10 group-hover:opacity-100" onClick={event => { event.stopPropagation(); void onSelect(workspace.id, true) }} title={t('sidebarMenu.openInNewWindow')}><ExternalLink className="h-3.5 w-3.5" /></button>}
            {activeWorkspaceId === workspace.id && <Check className="h-3.5 w-3.5" />}
          </div>
        </StyledDropdownMenuItem>)}
        <StyledDropdownMenuSeparator />
        <StyledDropdownMenuItem onClick={() => setShowCreationScreen(true)} className="font-sans"><FolderPlus className="h-4 w-4" />{t('workspace.addWorkspace')}</StyledDropdownMenuItem>
      </StyledDropdownMenuContent>
    </DropdownMenu>
  </>
}
