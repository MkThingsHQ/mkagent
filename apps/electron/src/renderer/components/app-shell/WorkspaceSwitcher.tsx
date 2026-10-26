import * as React from "react"
import { useTranslation } from "react-i18next"
import { useState, useCallback } from "react"
import { Check, FolderPlus, ExternalLink, ChevronDown, Trash2 } from "lucide-react"
import { AnimatePresence } from "motion/react"
import { useSetAtom } from "jotai"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { isWebUI } from "@/lib/platform"
import { fullscreenOverlayOpenAtom } from "@/atoms/overlay"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from "@/components/ui/styled-dropdown"
import { WorkspaceAvatar } from "@/components/ui/workspace-avatar"
import { FadingText } from "@/components/ui/fading-text"
import { RemoveWorkspaceDialog } from "@/components/workspace/RemoveWorkspaceDialog"
import { WorkspaceCreationScreen } from "@/components/workspace"
import { useWorkspaceIcons } from "@/hooks/useWorkspaceIcon"
import type { Workspace } from "../../../shared/types"

interface WorkspaceSwitcherProps {
  variant?: 'sidebar' | 'topbar'
  isCollapsed?: boolean
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onSelect: (workspaceId: string, openInNewWindow?: boolean) => void | Promise<void>
  onWorkspaceCreated?: (workspace: Workspace) => void
  onWorkspaceRemoved?: () => void
  /** workspaceId -> has unread */
  workspaceUnreadMap?: Record<string, boolean>
}

/**
 * WorkspaceSwitcher - Dropdown to select active workspace.
 *
 * Supports two trigger variants:
 * - sidebar: bottom-left selector trigger
 * - topbar: center top-bar selector trigger
 */
export function WorkspaceSwitcher({
  variant = 'sidebar',
  isCollapsed = false,
  workspaces,
  activeWorkspaceId,
  onSelect,
  onWorkspaceCreated,
  onWorkspaceRemoved,
  workspaceUnreadMap,
}: WorkspaceSwitcherProps) {
  const { t } = useTranslation()
  const [showCreationScreen, setShowCreationScreen] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<Workspace | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const setFullscreenOverlayOpen = useSetAtom(fullscreenOverlayOpenAtom)
  const selectedWorkspace = workspaces.find(w => w.id === activeWorkspaceId)
  const workspaceIconMap = useWorkspaceIcons(workspaces)
  const hasUnreadInOtherWorkspaces = React.useMemo(() => {
    if (!activeWorkspaceId || !workspaceUnreadMap) return false
    return workspaces.some((workspace) => workspace.id !== activeWorkspaceId && workspaceUnreadMap[workspace.id])
  }, [workspaces, activeWorkspaceId, workspaceUnreadMap])

  const handleNewWorkspace = () => {
    setShowCreationScreen(true)
    setFullscreenOverlayOpen(true)
  }

  const handleWorkspaceCreated = (workspace: Workspace) => {
    setShowCreationScreen(false)
    setFullscreenOverlayOpen(false)
    toast.success(t('toast.createdWorkspace', { name: workspace.name }))
    onWorkspaceCreated?.(workspace)
    onSelect(workspace.id)
  }

  /** Close the menu, then ask in RemoveWorkspaceDialog (rendered outside the menu). */
  const handleRemoveWorkspace = useCallback((workspace: Workspace) => {
    if (workspace.id === activeWorkspaceId) {
      toast.error(t('toast.cannotRemoveActiveWorkspace'))
      return
    }
    setMenuOpen(false)
    setPendingRemoval(workspace)
  }, [activeWorkspaceId, t])

  const handleCloseCreationScreen = useCallback(() => {
    setShowCreationScreen(false)
    setFullscreenOverlayOpen(false)
  }, [setFullscreenOverlayOpen])

  return (
    <>
      {/* Full-screen workspace creation overlay */}
      <AnimatePresence>
        {showCreationScreen && (
          <WorkspaceCreationScreen
            onWorkspaceCreated={handleWorkspaceCreated}
            onClose={handleCloseCreationScreen}
          />
        )}
      </AnimatePresence>

      <RemoveWorkspaceDialog
        workspace={pendingRemoval}
        iconUrl={pendingRemoval ? workspaceIconMap.get(pendingRemoval.id) : undefined}
        onClose={() => setPendingRemoval(null)}
        onRemoved={onWorkspaceRemoved}
      />

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          {variant === 'topbar' ? (
            <button
              type="button"
              data-workspace-switcher="topbar"
              className="titlebar-no-drag ml-1 min-w-0 max-w-full flex items-center justify-start gap-2 h-control pl-1 pr-1.5 rounded-md text-label font-medium text-foreground hover:bg-fill-hover data-[state=open]:bg-fill-hover transition-[background-color] duration-micro ease-out-subtle hover:duration-instant cursor-pointer"
              aria-label={t('workspace.selectWorkspace')}
            >
              <WorkspaceAvatar
                workspaceId={selectedWorkspace?.id}
                workspaceName={selectedWorkspace?.name}
                src={selectedWorkspace ? workspaceIconMap.get(selectedWorkspace.id) : undefined}
                className="size-5 rounded-sm shadow-elev-0"
                fallbackClassName="rounded-sm"
              />
              <span className="truncate min-w-0 flex-1 text-left">{selectedWorkspace?.name || 'Workspace'}</span>
              <ChevronDown data-slot="chevron" className="h-3 w-3 opacity-60 shrink-0" />
              {hasUnreadInOtherWorkspaces && <span className="h-2 w-2 rounded-full bg-accent shrink-0" />}
            </button>
          ) : (
            <button
              className={cn(
                "flex items-center gap-1 w-full min-w-0 justify-start px-2 py-1.5 rounded-md",
                "text-foreground hover:bg-foreground/5 data-[state=open]:bg-foreground/5 transition-colors duration-150",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isCollapsed && "h-9 w-9 shrink-0 justify-center p-0"
              )}
              aria-label={t('workspace.selectWorkspace')}
            >
              <WorkspaceAvatar
                workspaceId={selectedWorkspace?.id}
                workspaceName={selectedWorkspace?.name}
                src={selectedWorkspace ? workspaceIconMap.get(selectedWorkspace.id) : undefined}
                className="h-4 w-4 rounded-full ring-1 ring-border/50"
                fallbackClassName="rounded-full"
              />
              {!isCollapsed && (
                <>
                  <FadingText className="ml-1 font-sans min-w-0 text-sm" fadeWidth={36}>
                    {selectedWorkspace?.name || 'Select workspace'}
                  </FadingText>
                  <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                </>
              )}
            </button>
          )}
        </DropdownMenuTrigger>

        <StyledDropdownMenuContent
          align={variant === 'topbar' ? 'center' : 'start'}
          sideOffset={variant === 'topbar' ? 6 : 4}
          minWidth={variant === 'topbar' ? 'min-w-64' : undefined}
          onCloseAutoFocus={(event) => { if (pendingRemoval) event.preventDefault() }}
        >
          {workspaces.map((workspace) => {
            return (
              <StyledDropdownMenuItem
                key={workspace.id}
                onClick={(e) => {
                  const openInNewWindow = e.metaKey || e.ctrlKey
                  onSelect(workspace.id, openInNewWindow)
                }}
                className={cn(
                  "justify-between group",
                  activeWorkspaceId === workspace.id && "bg-foreground/10",
                )}
              >
                <div className="flex items-center gap-3 font-sans min-w-0 flex-1">
                  <WorkspaceAvatar
                    workspaceId={workspace.id}
                    workspaceName={workspace.name}
                    src={workspaceIconMap.get(workspace.id)}
                    className="h-5 w-5 rounded-full ring-1 ring-border/50"
                    fallbackClassName="rounded-full text-xs"
                  />
                  <span className="truncate">{workspace.name}</span>
                  {workspaceUnreadMap?.[workspace.id] && <span className="h-2 w-2 rounded-full bg-accent shrink-0" />}
                </div>
                <div className="flex items-center gap-1">
                  {/* Action buttons - only visible on hover for non-active workspaces.
                      Remove is Electron-only: the Web UI can't remove workspaces. */}
                  {activeWorkspaceId !== workspace.id && !isWebUI && (
                    <button
                      data-touch-reveal="true"
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveWorkspace(workspace)
                      }}
                      title={t("workspace.removeWorkspace")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {activeWorkspaceId !== workspace.id && (
                    <button
                      data-touch-reveal="true"
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-foreground/10 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(workspace.id, true)
                      }}
                      title={t("sidebarMenu.openInNewWindow")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {activeWorkspaceId === workspace.id && (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </div>
              </StyledDropdownMenuItem>
            )
          })}

          {/* Separator and New Workspace option */}
          <StyledDropdownMenuSeparator />
          <StyledDropdownMenuItem
            onClick={handleNewWorkspace}
            className="font-sans"
          >
            <FolderPlus className="h-4 w-4" />
            {t("workspace.addWorkspace")}
          </StyledDropdownMenuItem>
        </StyledDropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
