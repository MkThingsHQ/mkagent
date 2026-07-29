/**
 * TopBar - Persistent top bar above all panels.
 *
 * This is the Craft top-bar composition with only the product surfaces removed
 * from MkAgent (remote workspaces and product-specific menu entries).
 */

import { useTranslation } from 'react-i18next'
import * as Icons from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@mkagent/ui'
import { PanelLeftRounded } from '../icons/PanelLeftRounded'
import { SquarePenRounded } from '../icons/SquarePenRounded'
import { TopBarButton } from '../ui/TopBarButton'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { isMac, isWebUI } from '@/lib/platform'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'
import type { Workspace } from '../../../shared/types'

export interface TopBarProps {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onSelectWorkspace: (workspaceId: string) => void | Promise<void>
  onWorkspaceCreated?: (workspace: Workspace) => void
  onWorkspaceRemoved?: () => void
  onNewChat: () => void
  onBack: () => void
  onForward: () => void
  canGoBack: boolean
  canGoForward: boolean
  onToggleSidebar: () => void
  onAddBrowserPanel: () => void
  isCompact?: boolean
}

export function TopBar({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onWorkspaceCreated,
  onWorkspaceRemoved,
  onNewChat,
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  onToggleSidebar,
  onAddBrowserPanel,
  isCompact,
}: TopBarProps) {
  const { t } = useTranslation()
  const menuLeftPadding = isMac && !isWebUI ? 86 : 12

  return (
    <div
      className="fixed top-0 left-0 right-0 z-panel titlebar-drag-region"
      style={{ height: 'var(--topbar-height)' }}
    >
      <div className="flex h-full w-full items-center justify-between gap-2">
        <div
          className="pointer-events-auto flex min-w-0 flex-1 items-center gap-0.5"
          style={{ paddingLeft: menuLeftPadding, paddingRight: isCompact ? 12 : 0 }}
        >
          {!isCompact && (
            <Tooltip>
              <TooltipTrigger asChild>
                <TopBarButton onClick={onToggleSidebar} aria-label={t('menu.toggleSidebar')}>
                  <PanelLeftRounded className="h-[18px] w-[18px] text-foreground/70" />
                </TopBarButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('menu.toggleSidebar')}</TooltipContent>
            </Tooltip>
          )}

          <div className="ml-1 flex min-w-0 flex-1 items-center gap-1">
            {!isCompact && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TopBarButton onClick={onBack} disabled={!canGoBack} aria-label={t('common.back')}>
                      <Icons.ChevronLeft className="h-[18px] w-[18px] text-foreground/70" strokeWidth={1.5} />
                    </TopBarButton>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('common.back')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TopBarButton onClick={onForward} disabled={!canGoForward} aria-label={t('common.forward')}>
                      <Icons.ChevronRight className="h-[18px] w-[18px] text-foreground/70" strokeWidth={1.5} />
                    </TopBarButton>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('common.forward')}</TooltipContent>
                </Tooltip>
              </>
            )}

            <div className="min-w-0 w-[clamp(220px,42vw,640px)]"><WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} onSelect={(id, openInNewWindow) => openInNewWindow ? window.electronAPI.openWorkspace(id) : onSelectWorkspace(id)} onWorkspaceCreated={onWorkspaceCreated} onWorkspaceRemoved={onWorkspaceRemoved} /></div>
          </div>
        </div>

        {!isCompact && (
          <div className="flex min-w-0 shrink-0 items-center justify-end gap-1 pr-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TopBarButton aria-label={t('menu.addPanelMenu')} className="h-[26px] w-[26px] rounded-lg">
                  <Icons.Plus className="h-4 w-4 text-foreground/50" strokeWidth={1.5} />
                </TopBarButton>
              </DropdownMenuTrigger>
              <StyledDropdownMenuContent align="end" minWidth="min-w-56">
                <StyledDropdownMenuItem onClick={onNewChat}>
                  <SquarePenRounded className="h-3.5 w-3.5" />
                  {t('session.newSession')}
                </StyledDropdownMenuItem>
                <StyledDropdownMenuItem onClick={onAddBrowserPanel}>
                  <Icons.Globe className="h-3.5 w-3.5" />
                  {t('browser.newWindow')}
                </StyledDropdownMenuItem>
              </StyledDropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <TopBarButton
                  aria-label={t('menu.helpAndDocs')}
                  className="h-[26px] w-[26px] rounded-lg"
                  onClick={() => void window.electronAPI.openUrl('https://mkagent.app/docs')}
                >
                  <Icons.HelpCircle className="h-4 w-4 text-foreground/50" strokeWidth={1.5} />
                </TopBarButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('menu.helpAndDocs')}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  )
}
