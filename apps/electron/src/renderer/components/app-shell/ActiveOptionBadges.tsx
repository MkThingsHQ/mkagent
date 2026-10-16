import { cn } from '@/lib/utils'
import type { PermissionMode } from '@mkagent/shared/agent/modes'
import type { BackgroundTaskOutput } from '@mkagent/shared/protocol'
import { ActiveTasksBar, type BackgroundTask } from './ActiveTasksBar'
import { ComposerModeChip } from './input/ComposerModeChip'

/**
 * The rows above the composer: background-task chips, and the permission-mode chip while a decision
 * prompt replaces the composer toolbar. Session status, labels and info live in the chat header
 * (design spec §7.3), which keeps the composer stack light.
 */
export interface ActiveOptionBadgesProps {
  /**
   * Render the permission-mode chip. ChatInputZone turns it on only while a decision prompt replaces
   * the composer toolbar, where the chip normally lives (spec §7.5). Defaults to on for standalone use.
   */
  showPermissionMode?: boolean
  /** Current permission mode */
  permissionMode?: PermissionMode
  onPermissionModeChange?: (mode: PermissionMode) => void
  tasks?: BackgroundTask[]
  sessionId?: string
  onStopTask?: (task: BackgroundTask) => void
  onDismissTask?: (task: BackgroundTask) => void
  /** Show a task's full output (ChatDisplay opens it in an overlay) */
  onOpenTaskOutput?: (task: BackgroundTask, output: BackgroundTaskOutput) => void
  /** Additional CSS classes for the mode row */
  className?: string
}

export function ActiveOptionBadges({
  showPermissionMode = true,
  permissionMode = 'ask',
  onPermissionModeChange,
  tasks = [],
  sessionId,
  onStopTask,
  onDismissTask,
  onOpenTaskOutput,
  className,
}: ActiveOptionBadgesProps) {
  const showMode = showPermissionMode && !!permissionMode
  if (!sessionId && !showMode) return null

  return (
    <>
      {/* Background tasks row (running / done / orphaned chips), above the mode row so a growing number
       * of tasks wraps without moving it. Always mounted with a session: it animates its own exit. */}
      {sessionId && (
        <ActiveTasksBar
          tasks={tasks}
          sessionId={sessionId}
          onStopTask={onStopTask}
          onDismissTask={onDismissTask}
          onOpenTaskOutput={onOpenTaskOutput}
        />
      )}

      {showMode && (
        <div className={cn('flex items-center gap-1.5 mb-2 px-px', className)}>
          <ComposerModeChip
            permissionMode={permissionMode}
            onPermissionModeChange={onPermissionModeChange}
            sessionId={sessionId}
          />
        </div>
      )}
    </>
  )
}
