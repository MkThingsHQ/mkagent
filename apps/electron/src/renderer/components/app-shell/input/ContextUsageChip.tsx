import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@mkagent/ui'
import { cn } from '@/lib/utils'
import type { getContextDisplay, getContextDisplayLabels } from './context-display'

interface ContextUsageChipProps {
  display: ReturnType<typeof getContextDisplay>
  labels: ReturnType<typeof getContextDisplayLabels>
  isProcessing: boolean
  /** Show the ring meter next to the percent (dropped in the compact toolbar to save width) */
  showMeter?: boolean
  /** Sends /compact (only invoked when the display says compaction is possible) */
  onCompact: () => void
}

/** Ring meter: the arc fills to the usage (capped at a full ring; the label stays truthful). */
function UsageRing({ percent }: { percent: number }) {
  const radius = 5.5
  const circumference = 2 * Math.PI * radius
  const filled = Math.min(Math.max(percent, 0), 100) / 100
  return (
    <svg viewBox="0 0 14 14" className="size-3.5 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="7" cy="7" r={radius} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2} />
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={`${circumference * filled} ${circumference}`}
      />
    </svg>
  )
}

/**
 * Context usage meter (mockup `.ctx`): a quiet 28px chip in the info tint — it only appears at
 * high usage (getContextDisplay.showWarning). Same math, same visibility and the same
 * compact-on-click action as before; the percent may exceed 100%.
 */
export function ContextUsageChip({ display, labels, isProcessing, showMeter = true, onCompact }: ContextUsageChipProps) {
  const { t } = useTranslation()
  if (!display.showWarning || display.percent === null) return null
  const actionable = !isProcessing && display.canCompact

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => {
            if (actionable) onCompact()
          }}
          disabled={!actionable}
          aria-label={`${labels.window}: ${display.percent}%`}
          className={cn(
            'input-toolbar-btn motion-press inline-flex h-control shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5',
            showMeter && 'pl-2 @max-[32rem]/panel:pl-2.5',
            'bg-info-tint text-label-sm font-medium tabular-nums text-info select-none',
            actionable ? 'state-overlay' : 'cursor-default',
          )}
        >
          {/* The ring is decoration next to the percent: dropped in narrow panels to save toolbar room */}
          {showMeter && <span className="flex @max-[32rem]/panel:hidden"><UsageRing percent={display.percent} /></span>}
          {display.percent}%
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px]">
        <div className="space-y-0.5">
          <div>{labels.window}: {labels.usage}</div>
          {labels.qualifier && <div className="text-tertiary">{labels.qualifier}</div>}
          {display.canCompact && (
            <div>{isProcessing ? t('chat.contextUsage.waitToCompact') : t('chat.contextUsage.compact')}</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
