import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@mkagent/ui'
import { TWEEN } from '@mkagent/ui/motion'
import type { FollowUpInputItem } from './FreeFormInput'

function formatFollowUpChipText(text: string, fallback: string, maxLength = 50): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return fallback

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
    : normalized
}

interface FollowUpChipsProps {
  items: FollowUpInputItem[]
  /** Glide siblings (layout FLIP) only right after the set changed */
  animateLayout: boolean
  onItemClick?: (item: FollowUpInputItem, anchor?: { x: number; y: number }) => void
  onIndexClick?: (item: FollowUpInputItem) => void
}

/**
 * Follow-up annotation chips above the editor (mockup `.cx-queue` / `.queued`). The row mounts
 * once — no height animation; chips fade in with a ≤ 4px rise and siblings glide via FLIP.
 */
export function FollowUpChips({ items, animateLayout, onItemClick, onIndexClick }: FollowUpChipsProps) {
  const { t } = useTranslation()
  if (items.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
      <AnimatePresence initial={false}>
        {items.map((item, idx) => {
          const chipIndex = item.index ?? idx + 1
          const tooltipText = item.selectedText.trim() || t('chat.selectedText')
          const selectedExcerpt = formatFollowUpChipText(item.selectedText, t('chat.selectedText'), 50)
          const noteExcerpt = formatFollowUpChipText(item.noteLabel, t('chat.followUp'), 50)

          return (
            <motion.button
              key={item.id}
              type="button"
              layout={animateLayout}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: TWEEN.exit }}
              transition={TWEEN.fast}
              className="inline-flex h-control max-w-full transition-colors hover:duration-instant items-center gap-1.5 overflow-hidden rounded-md bg-fill-hover pl-1.5 pr-2.5 text-label text-secondary select-none hover:bg-fill-pressed hover:text-foreground"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                onItemClick?.(item, {
                  x: rect.left + rect.width / 2,
                  y: rect.top - 8,
                })
              }}
            >
              <Tooltip delayDuration={250}>
                <TooltipTrigger asChild>
                  <span
                    role="button"
                    tabIndex={0}
                    className="keycap inline-flex h-4.5 min-w-4.5 cursor-pointer items-center justify-center rounded-xs px-1 text-caption text-foreground"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onIndexClick?.(item)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        onIndexClick?.(item)
                      }
                    }}
                  >
                    {chipIndex}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[420px] break-words text-label-sm">
                  {tooltipText}
                </TooltipContent>
              </Tooltip>
              <span className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap pr-0.5 text-left">
                <span className="italic text-tertiary">{selectedExcerpt}</span>
                <span className="mx-1 text-tertiary">·</span>
                <span>{noteExcerpt}</span>
              </span>
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
