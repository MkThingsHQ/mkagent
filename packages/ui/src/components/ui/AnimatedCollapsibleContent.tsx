import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { DURATION, EASE, TWEEN } from '../../motion/presets'

interface AnimatedCollapsibleContentProps {
  isOpen: boolean
  children: React.ReactNode
  className?: string
}

/**
 * Collapsible content that expands in place. The layout changes once (no height animation —
 * transform/opacity only); the content fades in with a 4px drop and fades out quickly before
 * it unmounts. Under reduced motion only the fade remains (MotionConfig).
 */
export function AnimatedCollapsibleContent({ isOpen, children, className }: AnimatedCollapsibleContentProps) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: DURATION.exit * 0.9, ease: EASE.exit } }}
          transition={TWEEN.fast}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
