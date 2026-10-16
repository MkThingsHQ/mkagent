import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import {
  PermissionModeIcon,
  SlashCommandMenu,
  permissionModeCommandsFor,
  type SlashCommandId,
} from '@/components/ui/slash-command-menu'
import { isPermissionMode, type PermissionMode } from '@mkagent/shared/agent/modes'
import { useAvailablePermissionModes } from '@/hooks/useAvailablePermissionModes'
import { cn } from '@/lib/utils'
import { actionHotkeyKeys } from './action-hotkey'
import { MODE_CHIP_TONE, knownMode } from './composer-styles'

interface ComposerModeChipProps {
  permissionMode: PermissionMode
  onPermissionModeChange?: (mode: PermissionMode) => void
  sessionId?: string
}

/**
 * Permission-mode chip in the composer toolbar (desktop; compact uses the drawer selector).
 * Same popover menu and handlers as the former badge-row dropdown — only its place and look
 * changed: a tinted 28px pill (Explore neutral, Ask info, Guarded success, Execute accent).
 */
export function ComposerModeChip({ permissionMode, onPermissionModeChange, sessionId }: ComposerModeChipProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  // Optimistic local state - updates immediately, syncs with prop
  const [optimisticMode, setOptimisticMode] = React.useState(permissionMode)

  // Sync optimistic state when prop changes (confirmation from backend)
  React.useEffect(() => {
    setOptimisticMode(permissionMode)
  }, [permissionMode])

  const activeCommands = React.useMemo((): SlashCommandId[] => {
    return [optimisticMode as SlashCommandId]
  }, [optimisticMode])

  // Guarded is listed only while its decision-model feature is on (or it is the current mode)
  const modes = useAvailablePermissionModes(optimisticMode)
  const commandGroups = React.useMemo(() => [{ id: 'modes', commands: permissionModeCommandsFor(modes) }], [modes])

  // Handle command selection from dropdown
  const handleSelect = React.useCallback((commandId: SlashCommandId) => {
    if (isPermissionMode(commandId)) {
      setOptimisticMode(commandId)
      onPermissionModeChange?.(commandId)
    }
    setOpen(false)
  }, [onPermissionModeChange])

  // A mode this build does not know (newer server) renders as Ask instead of crashing the input
  const shownMode = knownMode(optimisticMode)
  const cycleKeys = actionHotkeyKeys('chat.cyclePermissionMode')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-tutorial="permission-mode-dropdown"
          data-mode={shownMode}
          aria-label={`${t('mode.permissionMode')}: ${t(`mode.${optimisticMode}`)}`}
          className={cn(
            // Narrow panels: icon only (the mode stays in the aria-label and the tint)
            'input-toolbar-btn motion-press state-overlay inline-flex h-control shrink-0 items-center gap-1.5 rounded-full px-2 @min-[32rem]/panel:pr-2.5',
            'text-label font-medium select-none',
            MODE_CHIP_TONE[shownMode],
          )}
        >
          <PermissionModeIcon mode={shownMode} className="size-3.5 shrink-0" />
          <span className="@max-[32rem]/panel:hidden">{t(`mode.${optimisticMode}`)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-w-sm p-0"
        side="top"
        align="end"
        sideOffset={6}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          // Don't auto-focus the text input on touch devices — it pulls up the virtual keyboard
          const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
          if (!isTouchDevice) {
            window.dispatchEvent(new CustomEvent('craft:focus-input', {
              detail: { sessionId }
            }))
          }
        }}
      >
        <SlashCommandMenu
          bare
          showDescriptions
          commandGroups={commandGroups}
          activeCommands={activeCommands}
          onSelect={handleSelect}
          showFilter
          footer={cycleKeys.length > 0 ? (
            <>
              <span className="flex-1">{t('shortcuts.action.cyclePermissionMode')}</span>
              <KbdGroup>
                {cycleKeys.map((key) => <Kbd key={key}>{key}</Kbd>)}
              </KbdGroup>
            </>
          ) : undefined}
        />
      </PopoverContent>
    </Popover>
  )
}
