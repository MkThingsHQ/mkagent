import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '../../lib/utils'
import { SPRING } from '../../motion/presets'
import { AnimatedCollapsibleContent } from '../ui/AnimatedCollapsibleContent'

interface CollapsibleSectionProps {
  sectionId: string
  headingLevel: number
  isCollapsed: boolean
  onToggle: (sectionId: string) => void
  children: React.ReactNode
}

/**
 * CollapsibleSection
 *
 * Renders a markdown section with a collapsible heading.
 * - First child is the heading (rendered as trigger)
 * - Remaining children are the content (collapsible)
 * - Chevron appears on hover, rotates when expanded
 * - Only H1-H4 are collapsible; H5-H6 render normally
 */
export function CollapsibleSection({
  sectionId,
  headingLevel,
  isCollapsed,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  // Extract heading (first child) and content (rest)
  const childArray = React.Children.toArray(children)
  const heading = childArray[0]
  const content = childArray.slice(1)

  // Only make H1-H4 collapsible
  if (headingLevel > 4) {
    return <>{children}</>
  }

  const isExpanded = !isCollapsed
  const hasContent = content.length > 0

  return (
    <div className="markdown-collapsible-section" data-section-id={sectionId}>
      {/* Heading with toggle trigger */}
      <div
        className={cn(
          'relative group',
          hasContent && 'cursor-pointer'
        )}
        onClick={() => hasContent && onToggle(sectionId)}
      >
        {/* Chevron - always visible when collapsed, hover-only when expanded */}
        <motion.div
          initial={false}
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={SPRING.snap}
          className={cn(
            'absolute -left-4 top-[5px] select-none transition-opacity duration-micro ease-out-subtle',
            !hasContent && 'opacity-0',
            hasContent && isCollapsed && 'opacity-100',
            hasContent && isExpanded && 'opacity-0 group-hover:opacity-100 group-hover:duration-instant'
          )}
        >
          <ChevronRight className="size-3 text-tertiary" />
        </motion.div>

        {/* Heading content */}
        {heading}
      </div>

      {/* Collapsible content */}
      {hasContent && (
        <AnimatedCollapsibleContent isOpen={isExpanded} className="overflow-hidden">
          <div className="collapsible-section-content">
            {content}
          </div>
        </AnimatedCollapsibleContent>
      )}
    </div>
  )
}
