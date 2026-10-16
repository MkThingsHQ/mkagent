/**
 * ActiveTasksBar — the row of background-task chips above the composer (BackgroundTaskChip).
 *
 * Chips slide in, leave with a fade, and the rest close the gap (motion layout). One card is open at
 * a time; its chip stays while it is open, even after its task finished and its linger ran out.
 */

import React from 'react'
import { useSetAtom } from 'jotai'
import { AnimatePresence, motion } from 'motion/react'
import { SPRING, TWEEN } from '@mkagent/ui/motion'
import type { BackgroundTaskOutput } from '@mkagent/shared/protocol'
import { BackgroundTaskChip } from './BackgroundTaskChip'
import { advanceBackgroundTaskChips } from './background-task-chip-state'
import { backgroundTasksAtomFamily, type BackgroundTask } from '@/atoms/sessions'

// Re-exported for existing consumers so the single definition lives in atoms/sessions.ts.
export type { BackgroundTask } from '@/atoms/sessions'

export interface ActiveTasksBarProps {
  /** Background tasks of the session */
  tasks: BackgroundTask[]
  sessionId: string
  onStopTask?: (task: BackgroundTask) => void
  onDismissTask?: (task: BackgroundTask) => void
  /** Show a task's full output (ChatDisplay opens it in an overlay) */
  onOpenTaskOutput?: (task: BackgroundTask, output: BackgroundTaskOutput) => void
}

export function ActiveTasksBar({ tasks, sessionId, onStopTask, onDismissTask, onOpenTaskOutput }: ActiveTasksBarProps) {
  const setTasks = useSetAtom(backgroundTasksAtomFamily(sessionId))
  const [openTaskId, setOpenTaskId] = React.useState<string | null>(null)
  const openTaskIdRef = React.useRef(openTaskId)
  openTaskIdRef.current = openTaskId

  // Stop an unconfirmed chip from spinning forever without pretending the task died: old no-signal
  // tasks become `stale`, terminal ones are pruned after their linger — except the one whose card is open.
  React.useEffect(() => {
    const interval = setInterval(() => {
      setTasks((prev) => advanceBackgroundTaskChips(prev, Date.now(), openTaskIdRef.current))
    }, 1000)
    return () => clearInterval(interval)
  }, [sessionId, setTasks])

  return (
    <AnimatePresence initial={false}>
      {tasks.length > 0 && (
        <motion.div
          key="background-tasks"
          data-slot="background-tasks"
          className="mb-2 flex flex-wrap items-center gap-1.5 px-px"
          // The row arrives with the session's first task: it rises in (the chips inside skip their
          // own enter on the row's first render). Rows already there on load don't animate.
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING.base, opacity: TWEEN.fast }}
          exit={{ opacity: 0, transition: TWEEN.exit }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {tasks.map((task) => (
              <motion.div
                key={task.id}
                layout="position"
                // A flex wrapper: the chip must not sit on a text baseline. A running chip's shimmer sets
                // overflow:hidden, which moves an inline-flex box's baseline to its bottom edge, so running
                // and finished chips landed ~5px apart.
                className="flex min-w-0 max-w-full"
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: TWEEN.exit }}
                transition={{ ...SPRING.base, opacity: TWEEN.fast }}
              >
                <BackgroundTaskChip
                  task={task}
                  sessionId={sessionId}
                  open={openTaskId === task.id}
                  onOpenChange={(open) => setOpenTaskId(current => (open ? task.id : current === task.id ? null : current))}
                  onStop={(target) => onStopTask?.(target)}
                  onDismiss={(target) => {
                    setOpenTaskId(null)
                    onDismissTask?.(target)
                  }}
                  onOpenOutput={onOpenTaskOutput}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
