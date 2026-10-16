/**
 * Pure helpers that turn an activity into display text (tool name, input summary, diff stats).
 * Moved out of TurnCard.tsx unchanged so the row components can share them.
 */
import i18n from 'i18next'
import { normalizePath, pathStartsWith, stripPathPrefix } from '@mkagent/core/utils'
import { parseDiffFromFile, type FileContents } from '@pierre/diffs'
import { getDiffStats, getUnifiedDiffStats } from '../../code-viewer'
import type { ActivityItem } from '../TurnCard'

/**
 * Simple markdown stripping for preview text.
 * Removes markdown syntax to show plain text preview.
 * Code block content is preserved as plain text.
 */
export function stripMarkdown(text: string): string {
  return text
    // Extract content from fenced code blocks (remove ``` and optional language)
    .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, '$1')
    // Extract content from inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Remove horizontal rules
    .replace(/^---+$/gm, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Compute diff stats for Edit/Write tool inputs.
 * Uses @pierre/diffs for accurate line-by-line diff calculation.
 *
 * Supports both:
 * - Claude Code format: { file_path, old_string, new_string }
 * - Codex format: { changes: Array<{ path, kind, diff }> }
 *
 * @param toolName - 'Edit' or 'Write'
 * @param toolInput - The tool input containing old_string/new_string (Edit) or content (Write)
 * @returns { additions, deletions } or null if not applicable
 */
export function computeEditWriteDiffStats(
  toolName: string | undefined,
  toolInput: Record<string, unknown> | undefined
): { additions: number; deletions: number } | null {
  if (!toolInput) return null

  if (toolName === 'Edit') {
    // Check for Codex format: { changes: Array<{ path, kind, diff }> }
    if (toolInput.changes && Array.isArray(toolInput.changes)) {
      let totalAdditions = 0
      let totalDeletions = 0
      for (const change of toolInput.changes as Array<{ path?: string; diff?: string }>) {
        if (change.diff) {
          const stats = getUnifiedDiffStats(change.diff, change.path || 'file')
          if (stats) {
            totalAdditions += stats.additions
            totalDeletions += stats.deletions
          }
        }
      }
      if (totalAdditions === 0 && totalDeletions === 0) return null
      return { additions: totalAdditions, deletions: totalDeletions }
    }

    // Claude Code format: { file_path, old_string, new_string }
    const oldString = (toolInput.old_string as string) ?? ''
    const newString = (toolInput.new_string as string) ?? ''
    if (!oldString && !newString) return null

    const oldFile: FileContents = { name: 'file', contents: oldString, lang: 'text' }
    const newFile: FileContents = { name: 'file', contents: newString, lang: 'text' }
    const fileDiff = parseDiffFromFile(oldFile, newFile)
    return getDiffStats(fileDiff)
  }

  if (toolName === 'Write') {
    const content = (toolInput.content as string) ?? ''
    if (!content) return null

    // For Write, everything is an addition (new file content)
    const oldFile: FileContents = { name: 'file', contents: '', lang: 'text' }
    const newFile: FileContents = { name: 'file', contents: content, lang: 'text' }
    const fileDiff = parseDiffFromFile(oldFile, newFile)
    return getDiffStats(fileDiff)
  }

  return null
}

/** Get display name for a tool (strip MCP prefixes, apply friendly names) */
export function getToolDisplayName(name: string): string {
  const stripped = name.replace(/^mcp__[^_]+__/, '')

  // Friendly display names for specific tools
  const displayNames: Record<string, string> = {
    'TodoWrite': 'Todo List Updated',
    'set_session_labels': 'Set Session Labels',
    'set_session_status': 'Set Session Status',
    'get_session_info': 'Get Session Info',
    'list_sessions': 'List Sessions',
    'archive_session': 'Archive Session',
    'create_task': 'Create Task',
    'list_background_tasks': 'List Background Tasks',
    'send_agent_message': 'Send Agent Message',
    'spawn_session': 'Spawn Session',
  }

  return displayNames[stripped] || stripped
}

/**
 * Strip session/workspace folder paths from file paths for cleaner display.
 * Only strips paths that match the current session folder path.
 * Example: /path/to/sessions/260121-foo/plans/file.md → plans/file.md
 */
export function stripSessionFolderPath(filePath: string, sessionFolderPath?: string): string {
  if (!sessionFolderPath) return filePath

  // Get workspace path (parent of sessions folder)
  // sessionFolderPath: /path/workspaces/{uuid}/sessions/{sessionId}
  const workspacePath = normalizePath(sessionFolderPath).replace(/\/sessions\/[^/]+$/, '')

  // Try session folder first (more specific)
  if (pathStartsWith(filePath, sessionFolderPath)) {
    return stripPathPrefix(filePath, sessionFolderPath)
  }

  // Then try workspace folder
  if (pathStartsWith(filePath, workspacePath)) {
    return stripPathPrefix(filePath, workspacePath)
  }

  return filePath
}

/** Format tool input as a concise summary - CSS truncate handles overflow */
export function formatToolInput(
  input?: Record<string, unknown>,
  toolName?: string,
  sessionFolderPath?: string
): string {
  if (!input || Object.keys(input).length === 0) return ''

  // For call_llm: model shown as badge, prompt duplicates intent
  if (toolName === 'mcp__session__call_llm') return ''
  // For decide: state/questions JSON is noise in a one-line summary; the intent
  // (and the overlay) carry the meaning
  if (toolName === 'mcp__session__decide') return ''

  const parts: string[] = []

  // For Edit/Write tools, only show file_path (skip old_string, new_string, replace_all, content)
  const isEditOrWrite = toolName === 'Edit' || toolName === 'Write'

  // Handle Codex format: { changes: Array<{ path, kind, diff }> }
  // Extract path from first change if present
  if (isEditOrWrite && input.changes && Array.isArray(input.changes)) {
    const firstChange = input.changes[0] as { path?: string } | undefined
    if (firstChange?.path) {
      const pathStr = stripSessionFolderPath(firstChange.path, sessionFolderPath)
      parts.push(pathStr)
    }
    return parts.join(' ')
  }

  for (const [key, value] of Object.entries(input)) {
    // Skip meta fields and description (shown separately)
    if (key === '_intent' || key === 'description' || value === undefined || value === null) continue

    // For Edit/Write tools, only include file_path
    if (isEditOrWrite && key !== 'file_path') continue

    let valStr = typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim()
      : JSON.stringify(value)

    // Strip session/workspace paths from file_path for Edit/Write tools
    if (isEditOrWrite && key === 'file_path' && typeof value === 'string') {
      valStr = stripSessionFolderPath(valStr, sessionFolderPath)
    }

    parts.push(valStr)
    if (parts.length >= 2) break // Max 2 values
  }
  return parts.join(' ')
}

/**
 * Extract the action portion from an LLM-provided displayName by stripping
 * a matching icon/tool prefix.
 *
 * Examples:
 *   extractActionFromDisplayName("Git", "Git Status")  → "Status"
 *   extractActionFromDisplayName("npm", "Install Deps") → "Install Deps"
 *   extractActionFromDisplayName("Git", "Check Branch")  → "Check Branch"
 */
function extractActionFromDisplayName(iconName: string, llmName: string): string {
  // If LLM name starts with the icon name, strip the prefix to get the action
  // "Git Status" with icon "Git" → "Status"
  if (llmName.toLowerCase().startsWith(iconName.toLowerCase() + ' ')) {
    return llmName.slice(iconName.length + 1).trim()
  }
  // Otherwise use the full LLM name as the action
  // "Install Dependencies" with icon "npm" → "Install Dependencies"
  return llmName
}

/**
 * Format tool display using embedded toolDisplayMeta.
 * toolDisplayMeta is set at storage time in the main process and includes:
 * - displayName: Human-readable name
 * - iconDataUrl: Base64-encoded icon (for skills/sources)
 * - description: Brief description
 * - category: 'skill' | 'source' | 'native' | 'mcp'
 */
export function formatToolDisplay(
  activity: ActivityItem
): { name: string; icon?: string; description?: string } {
  const { toolName, displayName, toolInput, toolDisplayMeta } = activity

  // Primary: Use embedded toolDisplayMeta (works in both Electron and viewer)
  if (toolDisplayMeta) {

    return {
      name: toolDisplayMeta.displayName,
      icon: toolDisplayMeta.iconDataUrl,
      description: toolDisplayMeta.description,
    }
  }

  // Fallback for Skill tool without toolDisplayMeta (legacy sessions)
  if (toolName === 'Skill' && toolInput?.skill) {
    const skillId = String(toolInput.skill)
    // Extract slug from qualified name (workspaceId:slug) for display
    const colonIdx = skillId.indexOf(':')
    const slug = colonIdx > 0 ? skillId.slice(colonIdx + 1) : skillId
    return { name: slug }
  }

  // Final fallback: Use LLM-generated displayName or tool name
  const name = displayName || (toolName ? getToolDisplayName(toolName) : i18n.t('turnCard.processing'))
  return { name }
}

/**
 * File name shown next to Edit/Write (when they have diff stats) and Read rows — the same
 * condition as the former filename badge. Supports Claude Code (`file_path`) and Codex
 * (`changes[0].path`) inputs.
 */
export function getActivityFileName(
  activity: ActivityItem,
  hasDiffStats: boolean
): string | undefined {
  const input = activity.toolInput
  if (!input) return undefined
  if (!hasDiffStats && activity.toolName !== 'Read') return undefined
  if (typeof input.file_path === 'string') {
    return normalizePath(input.file_path).split('/').pop()
  }
  if (hasDiffStats && Array.isArray(input.changes)) {
    const firstChange = input.changes[0] as { path?: string } | undefined
    if (firstChange?.path) return normalizePath(firstChange.path).split('/').pop()
  }
  return undefined
}
