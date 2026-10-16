/**
 * Info_Markdown
 *
 * Markdown content with consistent styling and heading detection.
 * Auto-adjusts top padding based on whether content starts with a heading.
 * Supports optional fullscreen view using the shared DocumentFormattedMarkdownOverlay component.
 */

import * as React from 'react'
import { useState } from 'react'
import { Markdown } from '@/components/markdown'
import { DocumentFormattedMarkdownOverlay } from '@mkagent/ui'
import { cn } from '@/lib/utils'
import { Info_FullscreenButton } from './Info_FullscreenButton'

export interface Info_MarkdownProps {
  /** Markdown content */
  children: string
  /** Optional max height with scroll */
  maxHeight?: number
  /** Markdown rendering mode */
  mode?: 'minimal' | 'full'
  className?: string
  /** Enable fullscreen button (shows Maximize2 icon on hover) */
  fullscreen?: boolean
}

export function Info_Markdown({
  children,
  maxHeight,
  mode = 'minimal',
  className,
  fullscreen = false,
}: Info_MarkdownProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Detect if content starts with H1-H3 heading
  const startsWithHeading = children.trimStart().match(/^#{1,3}\s/)

  return (
    <>
      <div
        className={cn(
          // Same inset as every other card body (Info_Table rows, settings rows): the card pad
          'px-card-pad pb-3 text-label',
          maxHeight && 'overflow-y-auto',
          startsWithHeading ? 'pt-0' : 'pt-1',
          // Add relative + group for fullscreen button positioning
          fullscreen && 'relative group',
          className
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        {/* Fullscreen button - visible on hover, positioned top-right */}
        {fullscreen && (
          <Info_FullscreenButton
            onClick={() => setIsFullscreen(true)}
            className="absolute top-2 right-2 z-local"
          />
        )}

        <Markdown mode={mode}>{children}</Markdown>
      </div>

      {/* Fullscreen overlay - reuses shared component from packages/ui */}
      {fullscreen && (
        <DocumentFormattedMarkdownOverlay
          content={children}
          isOpen={isFullscreen}
          onClose={() => setIsFullscreen(false)}
        />
      )}
    </>
  )
}
