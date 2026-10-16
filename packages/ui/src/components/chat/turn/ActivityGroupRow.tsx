import * as React from 'react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { SPRING, TWEEN } from '../../../motion/presets'
import type { ActivityItem } from '../TurnCard'
import { formatDuration, formatTokens, type ActivityGroup } from '../turn-utils'
import { ActivityStatusIcon } from './ActivityIcons'
import { ActivityRow } from './ActivityRow'
import { TurnIconButton } from './TurnIconButton'
import {
  CHIP_NEUTRAL,
  HOVER_REVEAL,
  ROW_ICON_SLOT,
  SIZE_CONFIG,
  WORK_LOG_BODY,
  WORK_LOG_ROW,
  WORK_LOG_ROW_INTERACTIVE,
  WORK_LOG_ROW_WRAPPER,
} from './turn-classes'
import { useRowReveal } from './use-row-reveal'

interface ActivityGroupRowProps {
  group: ActivityGroup
  /** Controlled expansion state for activity groups */
  expandedGroups?: Set<string>
  /** Callback when expansion changes */
  onExpandedGroupsChange?: (groups: Set<string>) => void
  /** Callback to open activity details */
  onOpenActivityDetails?: (activity: ActivityItem) => void
  /** Session folder path for stripping from file paths in tool display */
  sessionFolderPath?: string
  /** Display mode: 'detailed' shows all info, 'informative' hides MCP/API names and params */
  displayMode?: 'informative' | 'detailed'
  /** Animate rows created after the card mounted */
  animateInserts: boolean
  /** Wrapper classes/style (insert animation from the parent list) */
  className?: string
  style?: React.CSSProperties
}

function GroupChildren({
  group,
  onOpenActivityDetails,
  sessionFolderPath,
  displayMode,
  animateInserts,
}: Pick<ActivityGroupRowProps, 'group' | 'onOpenActivityDetails' | 'sessionFolderPath' | 'displayMode' | 'animateInserts'>) {
  const rowReveal = useRowReveal(group.children.length, animateInserts)
  return (
    <>
      {group.children.map((child, idx) => (
        <ActivityRow
          key={child.id}
          activity={child}
          onOpenDetails={onOpenActivityDetails ? () => onOpenActivityDetails(child) : undefined}
          isLastChild={idx === group.children.length - 1}
          sessionFolderPath={sessionFolderPath}
          displayMode={displayMode}
          {...rowReveal(idx)}
        />
      ))}
    </>
  )
}

/**
 * A Task subagent with its child activities: a header row (chevron · status · agent type ·
 * description · duration and tokens) and, when open, its rows under an inset hairline.
 * Expanding swaps the content in once (no height animation); closing fades it out quickly.
 */
export function ActivityGroupRow({
  group,
  expandedGroups: externalExpandedGroups,
  onExpandedGroupsChange,
  onOpenActivityDetails,
  sessionFolderPath,
  displayMode = 'detailed',
  animateInserts,
  className,
  style,
}: ActivityGroupRowProps) {
  const { t } = useTranslation()
  // Use local state if no controlled state provided
  const [localExpandedGroups, setLocalExpandedGroups] = useState<Set<string>>(new Set())
  const expandedGroups = externalExpandedGroups ?? localExpandedGroups
  const setExpandedGroups = onExpandedGroupsChange ?? setLocalExpandedGroups

  const groupId = group.parent.id
  const isExpanded = expandedGroups.has(groupId)

  const toggleExpanded = useCallback(() => {
    const next = new Set(expandedGroups)
    if (next.has(groupId)) {
      next.delete(groupId)
    } else {
      next.add(groupId)
    }
    setExpandedGroups(next)
  }, [groupId, expandedGroups, setExpandedGroups])

  const description = group.parent.toolInput?.description as string | undefined
  const subagentType = group.parent.toolInput?.subagent_type as string | undefined
  const isComplete = group.parent.status === 'completed' || group.parent.status === 'error'
  const hasError = group.parent.status === 'error'
  const taskOutput = group.taskOutputData
  const hasTokens = taskOutput && (taskOutput.inputTokens !== undefined || taskOutput.outputTokens !== undefined)

  return (
    <div className={cn('flex min-w-0 flex-col', className)} style={style}>
      <div className={cn(WORK_LOG_ROW_WRAPPER, 'group/row items-center')}>
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          className={cn(WORK_LOG_ROW, WORK_LOG_ROW_INTERACTIVE)}
        >
          <motion.span
            initial={false}
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={SPRING.snap}
            className={cn(ROW_ICON_SLOT, 'text-tertiary')}
          >
            <ChevronRight aria-hidden className={SIZE_CONFIG.iconSize} />
          </motion.span>
          <ActivityStatusIcon status={group.parent.status} toolName={group.parent.toolName} />
          <span className={cn(CHIP_NEUTRAL, 'font-medium')}>{group.continued ? t('turnCard.subagent') : subagentType || 'Task'}</span>
          {group.continued ? (
            // A subagent launched in an earlier turn: its rows are grouped here, collapsed
            <span className="min-w-0 truncate text-tertiary">{t('turnCard.subagentContinued', { count: group.children.length })}</span>
          ) : (
            <span className={cn('min-w-0 truncate', hasError && 'text-destructive')}>{description || 'Task'}</span>
          )}
          {isComplete && taskOutput && (taskOutput.durationMs !== undefined || hasTokens) && (
            <span className="shrink-0 text-label-sm tabular-nums text-tertiary">
              {taskOutput.durationMs !== undefined && formatDuration(taskOutput.durationMs)}
              {taskOutput.durationMs !== undefined && hasTokens && ' · '}
              {hasTokens && t('turnCard.tokenCount', {
                tokens: formatTokens((taskOutput.inputTokens || 0) + (taskOutput.outputTokens || 0)),
              })}
            </span>
          )}
          <span className="flex-1" />
        </button>
        {onOpenActivityDetails && isComplete && !group.continued && (
          <TurnIconButton
            aria-label={t('chat.viewOutput')}
            tooltip
            icon={<ArrowUpRight />}
            onClick={() => onOpenActivityDetails(group.parent)}
            data-touch-reveal="true"
            className={cn(HOVER_REVEAL, 'ml-1 group-hover/row:opacity-100 group-hover/row:duration-instant group-focus-within/row:opacity-100 focus-visible:-outline-offset-2')}
          />
        )}
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && group.children.length > 0 && (
          <motion.div key="children" exit={{ opacity: 0, transition: TWEEN.exit }} className={cn(WORK_LOG_BODY, 'mb-0.5')}>
            <GroupChildren
              group={group}
              onOpenActivityDetails={onOpenActivityDetails}
              sessionFolderPath={sessionFolderPath}
              displayMode={displayMode}
              animateInserts={animateInserts}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
