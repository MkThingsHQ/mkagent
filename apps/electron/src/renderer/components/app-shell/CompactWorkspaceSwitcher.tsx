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
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer"
import { WorkspaceAvatar } from "@/components/ui/workspace-avatar"
import { RemoveWorkspaceDialog } from "@/components/workspace/RemoveWorkspaceDialog"
import { WorkspaceCreationScreen } from "@/components/workspace"
import { useWorkspaceIcons } from "@/hooks/useWorkspaceIcon"
import type { Workspace } from "../../../shared/types"

interface CompactWorkspaceSwitcherProps {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onSelect: (workspaceId: string, openInNewWindow?: boolean) => void | Promise<void>
  onWorkspaceCreated?: (workspace: Workspace) => void
  onWorkspaceRemoved?: () => void
  workspaceUnreadMap?: Record<string, boolean>
}

/**
 * CompactWorkspaceSwitcher — bottom-sheet workspace picker for compact/touch mode.
 *
 * Mirrors the topbar trigger from `WorkspaceSwitcher` (avatar pill with chevron)
 * but opens a Drawer instead of a Radix DropdownMenu so the picker is
 * touch-friendly and avoids the awkward popover anchoring on narrow viewports.
 */
export function CompactWorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onWorkspaceCreated,
  onWorkspaceRemoved,
  workspaceUnreadMap,
}: CompactWorkspaceSwitcherProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [showCreationScreen, setShowCreationScreen] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<Workspace | null>(null)
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
    setOpen(false)
  }

  const handleWorkspaceCreated = (workspace: Workspace) => {
    setShowCreationScreen(false)
    setFullscreenOverlayOpen(false)
    toast.success(t('toast.createdWorkspace', { name: workspace.name }))
    onWorkspaceCreated?.(workspace)
    onSelect(workspace.id)
  }

  /** Close the sheet, then ask in RemoveWorkspaceDialog. */
  const handleRemoveWorkspace = useCallback((workspace: Workspace) => {
    if (workspace.id === activeWorkspaceId) {
      toast.error(t('toast.cannotRemoveActiveWorkspace'))
      return
    }
    setOpen(false)
    setPendingRemoval(workspace)
  }, [activeWorkspaceId, t])

  const handleCloseCreationScreen = useCallback(() => {
    setShowCreationScreen(false)
    setFullscreenOverlayOpen(false)
  }, [setFullscreenOverlayOpen])

  return (
    <>
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

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <button
            type="button"
            data-workspace-switcher="topbar"
            className="titlebar-no-drag ml-1 h-9 min-w-0 max-w-full flex items-center justify-start gap-2 pl-1 pr-2 rounded-md text-label-lg font-medium text-foreground hover:bg-fill-hover data-[state=open]:bg-fill-hover transition-[background-color] duration-micro ease-out-subtle hover:duration-instant cursor-pointer"
            aria-label={t('workspace.selectWorkspace')}
          >
            <WorkspaceAvatar
              workspaceId={selectedWorkspace?.id}
              workspaceName={selectedWorkspace?.name}
              src={selectedWorkspace ? workspaceIconMap.get(selectedWorkspace.id) : undefined}
              className="size-6 rounded-sm shadow-elev-0"
              fallbackClassName="rounded-full text-[11px]"
            />
            <span className="truncate min-w-0 flex-1 text-left">{selectedWorkspace?.name || 'Workspace'}</span>
            <ChevronDown data-slot="chevron" className="h-3 w-3 opacity-60 shrink-0" />
            {hasUnreadInOtherWorkspaces && <span className="h-2 w-2 rounded-full bg-accent shrink-0" />}
          </button>
        </DrawerTrigger>

        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t('workspace.selectWorkspace')}</DrawerTitle>
          </DrawerHeader>

          <div className="px-2 pb-2 flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto">
            {workspaces.map((workspace) => {
                const isActive = activeWorkspaceId === workspace.id
              const handleSelect = () => {
                onSelect(workspace.id)
                setOpen(false)
              }
              return (
                <div
                  key={workspace.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-[10px] transition-colors",
                    isActive ? "bg-foreground/5" : "hover:bg-foreground/5",
                  )}
                >
                  <button
                    type="button"
                    onClick={handleSelect}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left -outline-offset-2"
                  >
                    <WorkspaceAvatar
                      workspaceId={workspace.id}
                      workspaceName={workspace.name}
                      src={workspaceIconMap.get(workspace.id)}
                      className="size-7 rounded-sm shadow-elev-0 shrink-0"
                      fallbackClassName="rounded-sm text-label"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-copy font-medium">{workspace.name}</span>
                        {workspaceUnreadMap?.[workspace.id] && <span className="size-1.5 rounded-full bg-accent-solid shrink-0" />}
                      </div>
                    </div>
                  </button>
                  {!isActive && !isWebUI && (
                    <button
                      type="button"
                      onClick={() => handleRemoveWorkspace(workspace)}
                      className="shrink-0 size-9 rounded-md flex items-center justify-center text-secondary hover:text-destructive hover:bg-destructive-tint"
                      aria-label={t("workspace.removeWorkspace")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => { onSelect(workspace.id, true); setOpen(false) }}
                      className="shrink-0 size-9 rounded-md flex items-center justify-center text-secondary hover:text-foreground hover:bg-fill-hover"
                      aria-label={t("sidebarMenu.openInNewWindow")}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  )}
                  {isActive && (
                    <Check className="size-4 shrink-0 text-accent mr-2" />
                  )}
                </div>
              )
            })}

            <DrawerClose asChild>
              <button
                type="button"
                onClick={handleNewWorkspace}
                className="mt-1 flex items-center gap-3 px-2 min-h-row-touch py-2 rounded-md hover:bg-fill-hover transition-[background-color] duration-micro ease-out-subtle hover:duration-instant text-left"
              >
                <div className="size-7 rounded-sm bg-fill-hover flex items-center justify-center shrink-0">
                  <FolderPlus className="size-4 text-secondary" />
                </div>
                <span className="text-copy font-medium">{t("workspace.addWorkspace")}</span>
              </button>
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
