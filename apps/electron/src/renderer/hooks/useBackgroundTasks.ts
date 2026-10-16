/**
 * useBackgroundTasks - Hook for managing active background tasks
 *
 * Tracks background agents and shells per session.
 * Updated via event handlers for task_backgrounded, shell_backgrounded, task_progress.
 */

import { useAtom } from 'jotai'
import { useCallback } from 'react'
import { toast } from 'sonner'
import i18n from 'i18next'
import type { StopBackgroundTaskResult } from '@mkagent/shared/protocol'
import { backgroundTasksAtomFamily, type BackgroundTask } from '@/atoms/sessions'

/** How long a chip waits for the SDK's stopped notification before offering Stop again. */
const STOP_CONFIRM_TIMEOUT_MS = 15_000

export interface UseBackgroundTasksOptions {
  /** Session ID to track tasks for */
  sessionId: string
}

export interface UseBackgroundTasksResult {
  /** Active background tasks for this session */
  tasks: BackgroundTask[]
  /** Add a new background task */
  addTask: (task: Omit<BackgroundTask, 'elapsedSeconds'>) => void
  /** Update elapsed time for a task */
  updateTaskProgress: (toolUseId: string, elapsedSeconds: number) => void
  /** Remove a task (when completed or killed) */
  removeTask: (toolUseId: string) => void
  /** Ask the agent to stop a task (shell, agent or workflow) */
  stopTask: (task: BackgroundTask) => Promise<void>
  /** Hide a task's chip (renderer-only: it never stops the task) */
  dismissTask: (task: BackgroundTask) => void
}

/**
 * Hook for managing background tasks in a session
 */
export function useBackgroundTasks({ sessionId }: UseBackgroundTasksOptions): UseBackgroundTasksResult {
  const [tasks, setTasks] = useAtom(backgroundTasksAtomFamily(sessionId))

  const addTask = useCallback((task: Omit<BackgroundTask, 'elapsedSeconds'>) => {
    setTasks(prev => {
      // Check if task already exists (prevent duplicates)
      if (prev.some(t => t.toolUseId === task.toolUseId)) {
        return prev
      }
      // Add new task with 0 elapsed seconds
      return [...prev, { ...task, elapsedSeconds: 0 }]
    })
  }, [setTasks])

  const updateTaskProgress = useCallback((toolUseId: string, elapsedSeconds: number) => {
    setTasks(prev => prev.map(t =>
      t.toolUseId === toolUseId
        ? { ...t, elapsedSeconds }
        : t
    ))
  }, [setTasks])

  const removeTask = useCallback((toolUseId: string) => {
    setTasks(prev => prev.filter(t => t.toolUseId !== toolUseId))
  }, [setTasks])

  /**
   * The chip shows "Stopping…" until the SDK confirms with task_completed (status stopped). When no
   * live agent could take the request, the task already ended with the turn that ran it: show it
   * stopped. Any other failure is reported and the chip goes back to running — as it does when no
   * confirmation arrives in time, so it can be stopped again or dismissed (never shown as stopped
   * without proof).
   */
  const stopTask = useCallback(async (task: BackgroundTask) => {
    const update = (patch: Partial<BackgroundTask>) =>
      setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, ...patch } : t)))
    update({ stopping: true })
    let result: StopBackgroundTaskResult
    try {
      result = await window.electronAPI.stopBackgroundTask(sessionId, task.id)
    } catch (error) {
      result = { success: false, error: error instanceof Error ? error.message : String(error) }
    }
    if (result.success) {
      setTimeout(() => {
        setTasks(prev => prev.map(t => (t.id === task.id && t.stopping ? { ...t, stopping: false } : t)))
      }, STOP_CONFIRM_TIMEOUT_MS)
      return
    }
    if (result.error === 'not-running') {
      update({ stopping: false, status: 'stopped', completedAt: Date.now() })
    } else {
      update({ stopping: false })
      toast.error(i18n.t('chat.backgroundTask.stopFailed'), { description: result.error })
    }
  }, [sessionId, setTasks])

  const dismissTask = useCallback((task: BackgroundTask) => {
    setTasks(prev => prev.filter(t => t.id !== task.id))
  }, [setTasks])

  return {
    tasks,
    addTask,
    updateTaskProgress,
    removeTask,
    stopTask,
    dismissTask,
  }
}
