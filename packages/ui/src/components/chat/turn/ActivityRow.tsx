import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Check, MessageSquareText } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { Spinner } from '../../ui/LoadingIndicator'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip'
import type { ActivityItem } from '../TurnCard'
import { formatDuration } from '../turn-utils'
import { ResultGlyph, ToolIcon } from './ActivityIcons'
import {
  computeEditWriteDiffStats,
  formatToolDisplay,
  formatToolInput,
  getActivityFileName,
  stripMarkdown,
} from './tool-display'
import {
  CHIP_NEUTRAL,
  ROW_ICON_SLOT,
  SIZE_CONFIG,
  WORK_LOG_ROW,
  WORK_LOG_ROW_INTERACTIVE,
  WORK_LOG_ROW_WRAPPER,
} from './turn-classes'

export interface ActivityRowProps {
  activity: ActivityItem
  /** Callback to open activity details (overlay) */
  onOpenDetails?: () => void
  /** Whether this is the last child at its depth level (kept for API compatibility) */
  isLastChild?: boolean
  /** Session folder path for stripping from file paths in tool display */
  sessionFolderPath?: string
  /** Display mode: 'detailed' shows all info, 'informative' hides MCP/API names and params */
  displayMode?: 'informative' | 'detailed'
  /** Classes for the row wrapper (insert animation) */
  className?: string
  style?: React.CSSProperties
}

/**
 * A row is a button when it opens details (keyboard reachable, one tab stop), else a quiet div.
 * Nested depth (Task children) indents with 16px steps outside the hover fill.
 */
function RowShell({
  depth,
  onClick,
  wrapperClassName,
  wrapperStyle,
  children,
}: {
  depth: number
  onClick?: () => void
  wrapperClassName?: string
  wrapperStyle?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <div className={cn(WORK_LOG_ROW_WRAPPER, wrapperClassName)} style={wrapperStyle}>
      {Array.from({ length: depth }).map((_, i) => (
        <span key={i} aria-hidden className="w-4 shrink-0" />
      ))}
      {onClick ? (
        <button type="button" onClick={onClick} className={cn(WORK_LOG_ROW, WORK_LOG_ROW_INTERACTIVE)}>
          {children}
        </button>
      ) : (
        <div className={WORK_LOG_ROW}>{children}</div>
      )}
    </div>
  )
}

/**
 * Single activity row in the expanded work log (spec §7.4 tool rows): icon (tertiary) · verb
 * (secondary, destructive when failed) · object (tertiary; commands and paths in mono) ·
 * right-aligned result (+/− stats, error) with ✓ / ✗. Clicking opens the same details overlay
 * as before.
 */
export function ActivityRow({
  activity,
  onOpenDetails,
  sessionFolderPath,
  displayMode = 'detailed',
  className,
  style,
}: ActivityRowProps) {
  const { t } = useTranslation()
  const depth = activity.depth || 0

  // Intermediate messages (LLM commentary): "Thinking..." while streaming, the stripped text after
  if (activity.type === 'intermediate') {
    const isThinking = activity.status === 'running'
    const isComplete = activity.status === 'completed'
    const displayContent = isThinking ? t('chat.processing.thinking') : stripMarkdown(activity.content || '')
    return (
      <RowShell
        depth={depth}
        onClick={onOpenDetails && isComplete ? onOpenDetails : undefined}
        wrapperClassName={className}
        wrapperStyle={style}
      >
        <span className={ROW_ICON_SLOT}>
          {isThinking ? (
            <Spinner className={cn(SIZE_CONFIG.spinnerSize, 'text-accent')} />
          ) : (
            // A text bubble, not a dashed circle: at 14px that read as the "Todo" status glyph
            <MessageSquareText aria-hidden className={cn(SIZE_CONFIG.iconSize, 'text-tertiary')} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{displayContent}</span>
      </RowShell>
    )
  }

  // Status activities (e.g., compacting) - system-level line
  if (activity.type === 'status') {
    const isRunning = activity.status === 'running'
    return (
      <RowShell depth={depth} wrapperClassName={className} wrapperStyle={style}>
        <span className={ROW_ICON_SLOT}>
          {isRunning ? (
            <Spinner className={cn(SIZE_CONFIG.spinnerSizeSmall, 'text-accent')} />
          ) : (
            <Check aria-hidden className={cn(SIZE_CONFIG.iconSize, 'text-success')} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{activity.content}</span>
      </RowShell>
    )
  }

  // Tool activities
  // - DisplayName: From toolDisplayMeta (embedded in message) or LLM-generated or fallback
  // - Intent: For MCP tools (activity.intent), for Bash (toolInput.description)
  // - Params: Remaining tool input summary (detailed mode)
  const toolDisplay = formatToolDisplay(activity)
  const fullDisplayName = toolDisplay.name
    || (activity.type === 'thinking' ? t('chat.processing.thinking') : t('turnCard.processing'))

  // MCP/API tools: "ClickUp: clickup_search" -> source name + tool slug
  const isMcpOrApiTool = activity.toolName?.startsWith('mcp__') ?? false
  let sourceName = fullDisplayName
  let toolSlug: string | undefined
  if (isMcpOrApiTool) {
    const colonIndex = fullDisplayName.indexOf(':')
    if (colonIndex > 0) {
      sourceName = fullDisplayName.substring(0, colonIndex).trim()
      toolSlug = fullDisplayName.substring(colonIndex + 1).trim()
    }
  }
  const displayedName = isMcpOrApiTool ? sourceName : fullDisplayName

  const intentOrDescription = activity.intent || (activity.toolInput?.description as string | undefined)
  const inputSummary = formatToolInput(activity.toolInput, activity.toolName, sessionFolderPath)
  const diffStats = computeEditWriteDiffStats(activity.toolName, activity.toolInput)
  const isComplete = activity.status === 'completed' || activity.status === 'error'
  const isError = activity.status === 'error'
  const isBackgrounded = activity.status === 'backgrounded'
  const showFileFacts = !isMcpOrApiTool && !isBackgrounded
  const fileName = showFileFacts ? getActivityFileName(activity, !!diffStats) : undefined

  // For backgrounded tasks, show task/shell ID and elapsed time
  const backgroundInfo = isBackgrounded
    ? activity.taskId
      ? `Task ID: ${activity.taskId}${activity.elapsedSeconds ? `, ${formatDuration(activity.elapsedSeconds * 1000)} elapsed` : ''}`
      : activity.shellId
        ? `Shell ID: ${activity.shellId}${activity.elapsedSeconds ? `, ${formatDuration(activity.elapsedSeconds * 1000)} elapsed` : ''}`
        : null
    : null

  // Object: intent (plain) · tool slug · input summary (mono). Informative mode keeps intent only.
  const objectParts: Array<{ key: string; text: string; mono?: boolean }> = []
  if (!isBackgrounded) {
    if (intentOrDescription) objectParts.push({ key: 'intent', text: intentOrDescription })
    if (displayMode === 'detailed' && isMcpOrApiTool && toolSlug) objectParts.push({ key: 'slug', text: toolSlug })
    if (displayMode === 'detailed' && inputSummary) objectParts.push({ key: 'input', text: inputSummary, mono: true })
  }

  const llmModel = isMcpOrApiTool && activity.toolName === 'mcp__session__call_llm' && activity.toolInput?.model
    ? String(activity.toolInput.model)
    : undefined
  const hasDiff = showFileFacts && !!diffStats && (diffStats.additions > 0 || diffStats.deletions > 0)

  return (
    <RowShell
      depth={depth}
      onClick={onOpenDetails && isComplete ? onOpenDetails : undefined}
      wrapperClassName={className}
      wrapperStyle={style}
    >
      <span className={ROW_ICON_SLOT}>
        <ToolIcon toolName={activity.toolName} customIcon={toolDisplay.icon} />
      </span>
      <span className={cn('max-w-[60%] shrink-0 truncate', isError && 'text-destructive')}>{displayedName}</span>
      {llmModel && <span className={CHIP_NEUTRAL}>{llmModel}</span>}
      {fileName && <span className="min-w-0 max-w-[40%] shrink-0 truncate font-mono text-mono-ui text-secondary">{fileName}</span>}
      {objectParts.length > 0 ? (
        <span className="min-w-0 flex-1 truncate text-tertiary">
          {objectParts.map((part, i) => (
            <span key={part.key} className={cn(i > 0 && 'ml-2', part.mono && 'font-mono text-mono-ui')}>
              {part.text}
            </span>
          ))}
        </span>
      ) : (
        <span className="flex-1" />
      )}
      {backgroundInfo && <span className="min-w-0 max-w-[300px] truncate text-accent">{backgroundInfo}</span>}
      <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 pl-1 text-label-sm tabular-nums text-tertiary">
        {hasDiff && diffStats && (
          <span className="whitespace-nowrap">
            {diffStats.additions > 0 && <span className="text-success">+{diffStats.additions}</span>}
            {diffStats.additions > 0 && diffStats.deletions > 0 && ' '}
            {diffStats.deletions > 0 && <span className="text-destructive">−{diffStats.deletions}</span>}
          </span>
        )}
        {isError && activity.error && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-destructive">{t('common.error')}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[400px]">
              {activity.error}
            </TooltipContent>
          </Tooltip>
        )}
        <ResultGlyph status={activity.status} />
      </span>
    </RowShell>
  )
}
