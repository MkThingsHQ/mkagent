/**
 * Text for the collapsed work log row. Same sources as before (intent, running tools, latest
 * commentary, task description); the error count moved out of the text into a failure chip.
 */
import i18n from 'i18next'
import { isParentTaskTool } from '@mkagent/shared/utils/toolNames'
import type { ActivityItem } from '../TurnCard'
import { getToolDisplayName } from './tool-display'

export interface WorkLogPreview {
  /** Preview text after the step count, or undefined for the plain "N steps completed" summary */
  text?: string
}

/** Activities whose status is `error` — shown as a "N failed" chip on the collapsed row. */
export function countFailedActivities(activities: ActivityItem[]): number {
  let failed = 0
  for (const activity of activities) {
    if (activity.status === 'error') failed++
  }
  return failed
}

/** Get the preview text for the collapsed state */
export function getWorkLogPreview(
  activities: ActivityItem[],
  intent?: string,
  isStreaming?: boolean,
  hasResponse?: boolean,
  isComplete?: boolean
): WorkLogPreview {
  // If we have an explicit intent, use it
  if (intent) return { text: intent }

  // Find the most relevant activity intent
  const activityWithIntent = activities.find(a => a.intent)
  if (activityWithIntent?.intent) return { text: activityWithIntent.intent }

  // Check if we're in responding state
  if (isStreaming && hasResponse) return { text: i18n.t('turnCard.responding') }

  // Find running Task tools and show their description
  const runningTask = activities.find(a => isParentTaskTool(a.toolName ?? '') && a.status === 'running')
  if (runningTask?.toolInput?.description) {
    return { text: runningTask.toolInput.description as string }
  }

  // While still streaming, show the latest intermediate message content
  // This gives visibility into what the LLM is "thinking"
  if (isStreaming && !isComplete) {
    const latestIntermediate = [...activities]
      .reverse()
      .find(a => a.type === 'intermediate' && a.content)
    if (latestIntermediate?.content) {
      return { text: latestIntermediate.content }
    }
  }

  // Show running tool names
  const runningTools = activities.filter(a => a.status === 'running' && a.toolName)
  if (runningTools.length > 0) {
    const toolNames = runningTools
      .map(a => getToolDisplayName(a.toolName!))
      .slice(0, 3) // Max 3 names
    return { text: `${toolNames.join(', ')}...` }
  }

  // When complete, show first Task's description if available
  const firstTask = activities.find(a => isParentTaskTool(a.toolName ?? ''))
  if (firstTask?.toolInput?.description) {
    return { text: firstTask.toolInput.description as string }
  }

  // When complete, the step count carries the summary ("N steps completed")
  if (isComplete || (!isStreaming && activities.length > 0)) {
    return {}
  }

  return { text: i18n.t('turnCard.starting') }
}
