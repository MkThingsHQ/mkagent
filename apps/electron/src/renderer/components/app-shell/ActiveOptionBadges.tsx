import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  SlashCommandMenu,
  DEFAULT_SLASH_COMMAND_GROUPS,
  type SlashCommandId,
} from '@/components/ui/slash-command-menu'
import { ChevronDown, Info } from 'lucide-react'
import { PERMISSION_MODE_CONFIG, type PermissionMode } from '@mkagent/shared/agent/modes'
import { ActiveTasksBar, type BackgroundTask } from './ActiveTasksBar'
import type { TerminalOverlayData } from './TaskActionMenu'
import { SessionInfoPopover } from './SessionInfoPopover'

function PermissionModeIcon({ mode, className }: { mode: PermissionMode; className?: string }) {
  const config = PERMISSION_MODE_CONFIG[mode]
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={config.svgPath} />
    </svg>
  )
}

export interface ActiveOptionBadgesProps {
  permissionMode?: PermissionMode
  onPermissionModeChange?: (mode: PermissionMode) => void
  tasks?: BackgroundTask[]
  sessionId?: string
  sessionFolderPath?: string
  onKillTask?: (taskId: string) => void
  onInsertMessage?: (text: string) => void
  onShowTerminalOverlay?: (data: TerminalOverlayData) => void
  className?: string
}

export function ActiveOptionBadges({
  permissionMode = 'ask',
  onPermissionModeChange,
  tasks = [],
  sessionId,
  sessionFolderPath,
  onKillTask,
  onInsertMessage,
  onShowTerminalOverlay,
  className,
}: ActiveOptionBadgesProps) {
  if (!permissionMode && tasks.length === 0) return null

  return (
    <>
      {tasks.length > 0 && sessionId && (
        <div className="flex items-center flex-wrap gap-2 mb-2 px-px">
          <ActiveTasksBar
            tasks={tasks}
            sessionId={sessionId}
            onKillTask={onKillTask}
            onInsertMessage={onInsertMessage}
            onShowTerminalOverlay={onShowTerminalOverlay}
          />
        </div>
      )}

      <div className={cn('flex items-start gap-2 mb-2 px-px pt-px pb-0.5', className)}>
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {permissionMode && (
            <div className="shrink-0">
              <PermissionModeDropdown
                permissionMode={permissionMode}
                onPermissionModeChange={onPermissionModeChange}
                sessionId={sessionId}
              />
            </div>
          )}
        </div>
        <div className="shrink-0">
          <FilesPopoverButton sessionId={sessionId} sessionFolderPath={sessionFolderPath} />
        </div>
      </div>
    </>
  )
}

function FilesPopoverButton({
  sessionId,
  sessionFolderPath,
}: {
  sessionId?: string
  sessionFolderPath?: string
}) {
  const { t } = useTranslation()
  if (!sessionId) return null

  return (
    <SessionInfoPopover
      sessionId={sessionId}
      sessionFolderPath={sessionFolderPath}
      trigger={(
        <button
          type="button"
          className={cn(
            'h-[30px] pl-[12px] pr-[14px] text-xs font-medium rounded-[8px] flex items-center gap-1.5 shrink-0',
            'outline-none select-none transition-colors shadow-minimal',
            'hover:bg-foreground/5 data-[state=open]:bg-foreground/5',
            'bg-[color-mix(in_srgb,var(--background)_97%,var(--foreground)_3%)]',
            'text-foreground/80',
          )}
        >
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-nowrap">{t('common.info')}</span>
        </button>
      )}
    />
  )
}

interface PermissionModeDropdownProps {
  permissionMode: PermissionMode
  onPermissionModeChange?: (mode: PermissionMode) => void
  sessionId?: string
}

function PermissionModeDropdown({
  permissionMode,
  onPermissionModeChange,
  sessionId,
}: PermissionModeDropdownProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [optimisticMode, setOptimisticMode] = React.useState(permissionMode)

  React.useEffect(() => {
    setOptimisticMode(permissionMode)
  }, [permissionMode])

  const activeCommands = React.useMemo(
    (): SlashCommandId[] => [optimisticMode as SlashCommandId],
    [optimisticMode],
  )

  const handleSelect = React.useCallback((commandId: SlashCommandId) => {
    if (commandId === 'safe' || commandId === 'ask' || commandId === 'allow-all') {
      setOptimisticMode(commandId)
      onPermissionModeChange?.(commandId)
    }
    setOpen(false)
  }, [onPermissionModeChange])

  const currentStyle: Record<PermissionMode, { className: string; shadowVar: string }> = {
    safe: {
      className: 'bg-foreground/5 text-foreground/60',
      shadowVar: 'var(--foreground-rgb)',
    },
    ask: {
      className: 'bg-info/10 text-info',
      shadowVar: 'var(--info-rgb)',
    },
    'allow-all': {
      className: 'bg-accent/5 text-accent',
      shadowVar: 'var(--accent-rgb)',
    },
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-tutorial="permission-mode-dropdown"
          className={cn(
            'h-[30px] pl-2.5 pr-2 text-xs font-medium rounded-[8px] flex items-center gap-1.5 shadow-tinted outline-none select-none',
            currentStyle[optimisticMode].className,
          )}
          style={{ '--shadow-color': currentStyle[optimisticMode].shadowVar } as React.CSSProperties}
        >
          <PermissionModeIcon mode={optimisticMode} className="h-3.5 w-3.5" />
          <span>{t(`mode.${optimisticMode}`)}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 rounded-[8px] bg-background text-foreground shadow-modal-small"
        side="top"
        align="start"
        sideOffset={4}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
          if (!isTouchDevice) {
            window.dispatchEvent(new CustomEvent('craft:focus-input', {
              detail: { sessionId },
            }))
          }
        }}
      >
        <SlashCommandMenu
          commandGroups={DEFAULT_SLASH_COMMAND_GROUPS}
          activeCommands={activeCommands}
          onSelect={handleSelect}
          showFilter
        />
      </PopoverContent>
    </Popover>
  )
}

