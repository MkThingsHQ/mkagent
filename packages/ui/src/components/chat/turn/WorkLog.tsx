import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { SPRING, TWEEN } from '../../../motion/presets'
import type { ActivityItem, TodoItem } from '../TurnCard'
import { isActivityGroup, type ActivityGroup } from '../turn-utils'
import { ActivityGroupRow } from './ActivityGroupRow'
import { ActivityRow } from './ActivityRow'
import { ThinkingRow } from './ThinkingRow'
import { TodoList } from './TodoList'
import { CHIP_DESTRUCTIVE, HOVER_REVEAL, SIZE_CONFIG, WORK_LOG_BODY } from './turn-classes'
import { useRowReveal } from './use-row-reveal'
import type { WorkLogPreview } from './work-log-summary'

export interface WorkLogHeaderProps {
  /** Number of activities in the turn (the former step-count pill, now the summary lead) */
  activityCount: number
  preview: WorkLogPreview
  /** Activities with status `error`: shown as a destructive "N failed" chip */
  failedCount: number
  isExpanded: boolean
  onToggle: () => void
  /** Turn actions menu (⋯), revealed on hover/focus */
  actionsMenu?: React.ReactNode
}

/**
 * The collapsed work log (spec §7.4 "Work log"): a quiet 28px row — chevron that rotates on
 * the snap spring, "N steps · preview" summary, failure chip — with the ⋯ menu beside it
 * (a sibling, not nested in the toggle).
 */
export function WorkLogHeader({
  activityCount,
  preview,
  failedCount,
  isExpanded,
  onToggle,
  actionsMenu,
}: WorkLogHeaderProps) {
  const { t } = useTranslation()
  const lead = preview.text === undefined
    ? t('turnCard.stepsCompletedCount', { count: activityCount })
    : t('turnCard.stepCount', { count: activityCount })

  return (
    <div className="group/wl flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex min-h-7 in-data-compact:min-h-9 min-w-0 flex-1 -ml-1.5 items-center gap-2 rounded-md py-0.5 pl-1.5 pr-2 text-left text-label text-secondary transition-colors duration-micro ease-out-subtle hover:bg-fill-hover hover:duration-instant active:bg-fill-pressed"
      >
        <motion.span
          initial={false}
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={SPRING.snap}
          className="flex size-3.5 shrink-0 items-center justify-center text-tertiary"
        >
          <ChevronRight aria-hidden className="size-3.5" />
        </motion.span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-foreground">{lead}</span>
          {preview.text && (
            <>
              <span aria-hidden className="text-tertiary"> · </span>
              {preview.text}
            </>
          )}
        </span>
        {failedCount > 0 && (
          <span className={CHIP_DESTRUCTIVE}>{t('turnCard.failedCount', { count: failedCount })}</span>
        )}
      </button>
      {actionsMenu && (
        <div
          data-touch-reveal="true"
          className={cn(HOVER_REVEAL, 'flex shrink-0 group-hover/wl:opacity-100 group-hover/wl:duration-instant group-focus-within/wl:opacity-100')}
        >
          {actionsMenu}
        </div>
      )}
    </div>
  )
}

export interface WorkLogProps extends WorkLogHeaderProps {
  /** Time-sorted, non-plan activities */
  activities: ActivityItem[]
  /** Task-subagent grouping (null = flat list) */
  groupedActivities: Array<ActivityItem | ActivityGroup> | null
  lastChildSet: Set<string>
  expandedActivityGroups: Set<string>
  onExpandedActivityGroupsChange: (groups: Set<string>) => void
  onOpenActivityDetails?: (activity: ActivityItem) => void
  sessionFolderPath?: string
  displayMode: 'informative' | 'detailed'
  /** "Thinking..." / "Preparing response..." line at the end of the list */
  thinkingLabel?: string
  todos?: TodoItem[]
  /** Rows created after the card mounted animate in (false on the card's first render) */
  animateInserts: boolean
  /** Scroll container of the rows (TurnCard scrolls it to the end when the user expands) */
  listRef: React.Ref<HTMLDivElement>
}

function WorkLogRows({
  activities,
  groupedActivities,
  lastChildSet,
  expandedActivityGroups,
  onExpandedActivityGroupsChange,
  onOpenActivityDetails,
  sessionFolderPath,
  displayMode,
  thinkingLabel,
  animateInserts,
  listRef,
}: Omit<WorkLogProps, keyof WorkLogHeaderProps | 'todos'>) {
  const items = groupedActivities ?? activities
  const rowReveal = useRowReveal(items.length, animateInserts)
  const isScrollable = activities.length > SIZE_CONFIG.maxVisibleActivities

  return (
    <div
      ref={listRef}
      className={cn(WORK_LOG_BODY, 'my-0.5', isScrollable && 'overflow-y-auto scrollbar-hover')}
      style={isScrollable ? { maxHeight: SIZE_CONFIG.maxVisibleActivities * SIZE_CONFIG.activityRowHeight } : undefined}
    >
      {groupedActivities
        ? groupedActivities.map((item, index) =>
            isActivityGroup(item) ? (
              <ActivityGroupRow
                key={item.parent.id}
                group={item}
                expandedGroups={expandedActivityGroups}
                onExpandedGroupsChange={onExpandedActivityGroupsChange}
                onOpenActivityDetails={onOpenActivityDetails}
                sessionFolderPath={sessionFolderPath}
                displayMode={displayMode}
                animateInserts={animateInserts}
                {...rowReveal(index)}
              />
            ) : (
              <ActivityRow
                key={item.id}
                activity={item}
                onOpenDetails={onOpenActivityDetails ? () => onOpenActivityDetails(item) : undefined}
                sessionFolderPath={sessionFolderPath}
                displayMode={displayMode}
                {...rowReveal(index)}
              />
            )
          )
        : activities.map((activity, index) => (
            <ActivityRow
              key={activity.id}
              activity={activity}
              onOpenDetails={onOpenActivityDetails ? () => onOpenActivityDetails(activity) : undefined}
              isLastChild={lastChildSet.has(activity.id)}
              sessionFolderPath={sessionFolderPath}
              displayMode={displayMode}
              {...rowReveal(index)}
            />
          ))}
      {thinkingLabel && <ThinkingRow label={thinkingLabel} {...rowReveal(items.length)} />}
    </div>
  )
}

/**
 * The activity section of a turn: summary row plus, when open, the tool rows under an inset
 * hairline and the todo list. Opening swaps the rows in once (no height animation) and the
 * first rows fade in with a 25ms stagger; closing fades the rows out quickly.
 * Excluded from transcript search (matches ripgrep behavior).
 */
export function WorkLog({ todos, ...props }: WorkLogProps) {
  const { activityCount, preview, failedCount, isExpanded, onToggle, actionsMenu, ...rowProps } = props
  return (
    <div className="group min-w-0 select-none" data-search-exclude="true">
      <WorkLogHeader
        activityCount={activityCount}
        preview={preview}
        failedCount={failedCount}
        isExpanded={isExpanded}
        onToggle={onToggle}
        actionsMenu={actionsMenu}
      />
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div key="work-log-body" exit={{ opacity: 0, transition: TWEEN.exit }}>
            <WorkLogRows {...rowProps} />
            {todos && todos.length > 0 && <TodoList todos={todos} animateInserts={rowProps.animateInserts} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
