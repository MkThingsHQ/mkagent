import * as React from "react"
import { useTranslation } from "react-i18next"
import { motion } from "motion/react"
import { Spinner } from "@mkagent/ui"
import { TWEEN } from "@mkagent/ui/motion"

/**
 * Processing status messages - cycles through these randomly
 * Inspired by Claude Code's playful status messages
 */
export const PROCESSING_MESSAGE_KEYS = [
  'chat.processing.thinking',
  'chat.processing.pondering',
  'chat.processing.contemplating',
  'chat.processing.reasoning',
  'chat.processing.processing',
  'chat.processing.computing',
  'chat.processing.considering',
  'chat.processing.reflecting',
  'chat.processing.deliberating',
  'chat.processing.cogitating',
  'chat.processing.ruminating',
  'chat.processing.musing',
  'chat.processing.workingOnIt',
  'chat.processing.onIt',
  'chat.processing.crunching',
  'chat.processing.brewing',
  'chat.processing.connectingDots',
  'chat.processing.mullingItOver',
  'chat.processing.deepInThought',
  'chat.processing.hmm',
  'chat.processing.letMeSee',
  'chat.processing.oneMoment',
  'chat.processing.holdOn',
  'chat.processing.bearWithMe',
  'chat.processing.justASec',
  'chat.processing.hangTight',
  'chat.processing.gettingThere',
  'chat.processing.almost',
  'chat.processing.working',
  'chat.processing.busyBusy',
  'chat.processing.whirring',
  'chat.processing.churning',
  'chat.processing.percolating',
  'chat.processing.simmering',
  'chat.processing.cooking',
  'chat.processing.baking',
  'chat.processing.stirring',
  'chat.processing.spinningUp',
  'chat.processing.warmingUp',
  'chat.processing.revving',
  'chat.processing.buzzing',
  'chat.processing.humming',
  'chat.processing.ticking',
  'chat.processing.clicking',
  'chat.processing.whizzing',
  'chat.processing.zooming',
  'chat.processing.zipping',
  'chat.processing.chugging',
  'chat.processing.trucking',
  'chat.processing.rolling',
]

/**
 * Format elapsed time: "45s" under a minute, "1:02" for 1+ minutes
 */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

interface ProcessingIndicatorProps {
  /** Start timestamp (persists across remounts) */
  startTime?: number
  /** Override cycling messages with explicit status (e.g., "Compacting...") */
  statusMessage?: string
}

/**
 * ProcessingIndicator - the live line while a turn runs (spec §6.4, visual part): a 28px row
 * with the working spinner on the work log's icon column, the status label in secondary and
 * the elapsed time in tertiary tabular figures. A new label fades in (150ms) in place — no
 * crossfade that waits for the old one to leave.
 */
export function ProcessingIndicator({ startTime, statusMessage }: ProcessingIndicatorProps) {
  const { t } = useTranslation()
  const [elapsed, setElapsed] = React.useState(0)
  const [messageIndex, setMessageIndex] = React.useState(() =>
    Math.floor(Math.random() * PROCESSING_MESSAGE_KEYS.length)
  )

  // Update elapsed time every second using provided startTime
  React.useEffect(() => {
    const start = startTime || Date.now()
    // Set initial elapsed immediately
    setElapsed(Math.floor((Date.now() - start) / 1000))

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  // Cycle through messages every 10 seconds (only when not showing status)
  React.useEffect(() => {
    if (statusMessage) return  // Don't cycle when showing status
    const interval = setInterval(() => {
      setMessageIndex(prev => {
        // Pick a random different message
        let next = Math.floor(Math.random() * PROCESSING_MESSAGE_KEYS.length)
        while (next === prev && PROCESSING_MESSAGE_KEYS.length > 1) {
          next = Math.floor(Math.random() * PROCESSING_MESSAGE_KEYS.length)
        }
        return next
      })
    }, 10000)
    return () => clearInterval(interval)
  }, [statusMessage])

  // Use status message if provided, otherwise cycle through default messages
  const displayMessage = statusMessage || t(PROCESSING_MESSAGE_KEYS[messageIndex])

  return (
    <div className="flex min-h-7 min-w-0 items-center gap-2 text-label text-secondary">
      {/* Spinner on the same column as the work log chevron and row icons */}
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Spinner className="text-caption text-accent" />
      </span>
      <motion.span
        key={displayMessage}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={TWEEN.fast}
        className="min-w-0 truncate"
      >
        {displayMessage}
      </motion.span>
      {elapsed >= 1 && (
        <span className="shrink-0 text-label-sm tabular-nums text-tertiary">
          {formatElapsed(elapsed)}
        </span>
      )}
    </div>
  )
}
