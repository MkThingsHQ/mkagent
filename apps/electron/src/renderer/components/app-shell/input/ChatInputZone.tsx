import type { BackgroundTaskOutput } from '@mkagent/shared/protocol'
import * as React from 'react'
import { useSetAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { Play, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHAT_LAYOUT } from '@/config/layout'
import type { PermissionMode } from '@mkagent/shared/agent/modes'
import type { BackgroundTask } from '../ActiveTasksBar'
import { ActiveOptionBadges } from '../ActiveOptionBadges'
import { InputContainer } from './InputContainer'
import { InputErrorBoundary } from './InputErrorBoundary'
import { ComposerHintLine } from './ComposerHintLine'
import { COMPOSER_META_CHIP } from './composer-styles'

/**
 * Offer to run a pasted console snippet as a background command. Running sends the run request
 * (the agent starts it, under the permission mode) and takes the snippet out of the composer.
 */
function PastedCommandChip({ command, onRun, onDismiss }: { command: string; onRun: () => void; onDismiss: () => void }) {
  const { t } = useTranslation()
  const [firstLine] = command.split('\n')
  return (
    <div className="mb-2 flex min-w-0 items-center gap-0.5 px-px transition-[opacity,translate] duration-base ease-out starting:translate-y-1 starting:opacity-0">
      <button type="button" onClick={onRun} title={command} className={cn(COMPOSER_META_CHIP, 'min-w-0 cursor-pointer pl-2')}>
        <Play aria-hidden className="size-3.5 shrink-0 text-accent" />
        <span className="shrink-0">{t('chat.runCommandInBackground')}</span>
        <span className="min-w-0 max-w-[320px] truncate font-mono font-normal text-tertiary">
          {firstLine}{command.includes('\n') ? ' …' : ''}
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('common.dismiss')}
        className="inline-grid size-6 shrink-0 place-items-center rounded-full text-tertiary hover:bg-fill-hover hover:text-foreground"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  )
}

interface ChatInputZoneProps {
  compactMode?: boolean
  /** Show the row above the composer (background tasks, the mode chip during decision prompts) */
  showOptionBadges?: boolean
  permissionMode?: PermissionMode
  onPermissionModeChange?: (mode: PermissionMode) => void
  tasks?: BackgroundTask[]
  sessionId: string
  sessionFolderPath?: string
  onStopTask?: (task: BackgroundTask) => void
  onDismissTask?: (task: BackgroundTask) => void
  /** Show a background task's full output (ChatDisplay opens it in an overlay) */
  onOpenTaskOutput?: (task: BackgroundTask, output: BackgroundTaskOutput) => void
  /** Run a shell command as a background task (a pasted console snippet's "Run in background") */
  onRunCommand?: (command: string) => void
  className?: string
  inputProps: React.ComponentProps<typeof InputContainer>
}

export function ChatInputZone({
  compactMode = false,
  showOptionBadges,
  permissionMode = 'ask',
  onPermissionModeChange,
  tasks = [],
  sessionId,
  sessionFolderPath,
  onStopTask,
  onDismissTask,
  onOpenTaskOutput,
  onRunCommand,
  className,
  inputProps,
}: ChatInputZoneProps) {
  const shouldShowOptionBadges = showOptionBadges ?? !compactMode
  const inputResetKey = `${sessionId}::${inputProps.structuredInput?.type ?? 'freeform'}`

  // A pasted console snippet offers "Run in background" until it is run, dismissed, or deleted from
  // the composer (the paste lands after the event, so the offer waits until it has seen the text).
  const [pastedSnippet, setPastedSnippet] = React.useState<{ command: string; text: string } | null>(null)
  const snippetSeenRef = React.useRef(false)
  React.useEffect(() => { setPastedSnippet(null) }, [sessionId])
  React.useEffect(() => {
    if (!pastedSnippet) return
    const marker = pastedSnippet.text.trim().split('\n')[0] ?? ''
    if ((inputProps.inputValue ?? '').includes(marker)) snippetSeenRef.current = true
    else if (snippetSeenRef.current) setPastedSnippet(null)
  }, [inputProps.inputValue, pastedSnippet])
  const handleSnippetPaste = React.useCallback((snippet: { command: string; text: string }) => {
    snippetSeenRef.current = false
    setPastedSnippet(snippet)
  }, [])
  const handleRunPasted = () => {
    if (!pastedSnippet || !onRunCommand) return
    onRunCommand(pastedSnippet.command)
    if ((inputProps.inputValue ?? '').trim() === pastedSnippet.text.trim()) inputProps.onInputChange?.('')
    setPastedSnippet(null)
  }

  const handleClearDraft = React.useCallback(() => {
    inputProps.onInputChange?.('')
    inputProps.onAttachmentsChange?.([])
  }, [inputProps])

  return (
    <div className={cn(
      CHAT_LAYOUT.maxWidth,
      'mx-auto w-full mt-1',
      // The card lines up with the transcript's text edge: the 16px gutter in compact, the column's
      // 24px gutters on desktop (the hint line below the card reserves its own 24px)
      compactMode ? 'px-gutter pb-gutter' : 'px-3 @xs/panel:px-6 pb-3.5',
      className,
    )}>
      {(shouldShowOptionBadges || tasks.length > 0) && (
        <ActiveOptionBadges
          // The permission-mode chip lives in the composer toolbar next to the model (spec §7.5).
          // A decision prompt replaces that toolbar, so the chip moves up here while one is shown.
          showPermissionMode={!!inputProps.structuredInput}
          permissionMode={permissionMode}
          onPermissionModeChange={onPermissionModeChange}
          tasks={tasks}
          sessionId={sessionId}
          onStopTask={onStopTask}
          onDismissTask={onDismissTask}
          onOpenTaskOutput={onOpenTaskOutput}
        />
      )}

      {pastedSnippet && onRunCommand && (
        <PastedCommandChip command={pastedSnippet.command} onRun={handleRunPasted} onDismiss={() => setPastedSnippet(null)} />
      )}

      <InputErrorBoundary
        sessionId={sessionId}
        resetKey={inputResetKey}
        onClearDraft={handleClearDraft}
      >
        <InputContainer
          {...inputProps}
          onConsoleSnippetPaste={onRunCommand ? handleSnippetPaste : undefined}
          compactMode={compactMode}
          showPermissionModeChip={shouldShowOptionBadges}
          permissionMode={permissionMode}
          onPermissionModeChange={onPermissionModeChange}
          sessionFolderPath={sessionFolderPath}
          sessionId={sessionId}
        />
      </InputErrorBoundary>

      {/* Desktop shortcut hints: reserved height, shown while the composer has focus */}
      {!compactMode && <ComposerHintLine empty={!!inputProps.structuredInput} />}
    </div>
  )
}
