/**
 * PreviewBlockChrome - the shared frame for rich preview blocks in the transcript (datatable,
 * spreadsheet, html/pdf/markdown/image previews, mermaid).
 *
 * Same well language as CodeBlock and MarkdownDiffBlock (spec §7.4): a sunken well with a hairline
 * (radius-md, border-subtle) and a 32px header — icon (tertiary) · title (secondary, truncates) ·
 * spacer · actions. Actions are the transcript's named 24px icon buttons (TurnIconButton; 36px in
 * the compact shell through its `data-slot="icon-button"` hook). Native `title` tooltips keep the
 * blocks usable in hosts that mount no TooltipProvider (marketing renders Markdown too).
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { TurnIconButton, type TurnIconButtonProps } from '../chat/turn/TurnIconButton'
import { Spinner } from '../ui/LoadingIndicator'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '../ui/StyledDropdown'

// ── Frame + header ───────────────────────────────────────────────────────────

/**
 * The well: radius-md, hairline, sunken. Content that needs a page behind it adds its own surface.
 * `isolate` keeps inner stacking (fades, stacked image cards) from competing with the transcript's
 * sticky chrome.
 */
export const PreviewBlockFrame = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('relative isolate overflow-hidden rounded-md border border-subtle bg-sunken', className)}
      {...props}
    />
  )
)
PreviewBlockFrame.displayName = 'PreviewBlockFrame'

export interface PreviewBlockHeaderProps {
  /** Lucide icon element; rendered 14px in the tertiary role */
  icon?: React.ReactNode
  /** Block title (truncates; the full text is the native tooltip) */
  title: string
  /** Header actions: PreviewBlockAction buttons, item navigator, menus */
  children?: React.ReactNode
}

/** 32px header: icon · title · spacer · actions (mockup `.cb-head`). */
export function PreviewBlockHeader({ icon, title, children }: PreviewBlockHeaderProps) {
  return (
    <div
      className={cn(
        'flex h-8 items-center gap-2 border-b border-subtle pl-3 text-label-sm text-tertiary',
        children ? 'pr-1' : 'pr-3'
      )}
    >
      {icon && (
        <span aria-hidden className="flex shrink-0 [&_svg]:size-3.5">
          {icon}
        </span>
      )}
      <span title={title} className="min-w-0 truncate text-secondary">
        {title}
      </span>
      <span className="flex-1" />
      {children && <div className="flex shrink-0 items-center gap-0.5">{children}</div>}
    </div>
  )
}

/**
 * A header action: the transcript icon button (same component as CodeBlock's Copy), named, with
 * the name repeated as a native tooltip.
 */
export const PreviewBlockAction = React.forwardRef<HTMLButtonElement, TurnIconButtonProps>(
  (props, ref) => <TurnIconButton ref={ref} title={props['aria-label']} {...props} />
)
PreviewBlockAction.displayName = 'PreviewBlockAction'

/**
 * Overlay header variant (fullscreen table headers sit next to the overlay's own 28px controls):
 * 28px target, 16px icon, same ghost treatment.
 */
export const PREVIEW_OVERLAY_ACTION = "size-control rounded-md [&_svg:not([class*='size-'])]:size-4"

// ── States ───────────────────────────────────────────────────────────────────

/** Loading line: spinner + label in the tertiary role, centered in whatever box the caller reserves. */
export function PreviewBlockLoading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 px-3 py-6 text-label text-tertiary', className)}>
      {/* The visible label carries the state; the spinner's own status role would repeat it */}
      <span aria-hidden className="flex text-caption">
        <Spinner />
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  )
}

/** Error line: icon + message in the destructive role (shape + text, never color alone). */
export function PreviewBlockError({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-center gap-2 px-3 py-6 text-label text-destructive', className)}>
      <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 wrap-anywhere">{children}</span>
    </div>
  )
}

// ── Fade ─────────────────────────────────────────────────────────────────────

/**
 * Bottom fade over clipped content: dissolves into the surface the content sits on (the well by
 * default, `paper` for document bodies) so the cut reads as "continues below".
 */
export function PreviewBlockFade({ surface = 'sunken' }: { surface?: 'sunken' | 'paper' }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 z-local h-8 bg-linear-to-b from-transparent',
        surface === 'paper' ? 'to-paper' : 'to-sunken'
      )}
    />
  )
}

// ── Item navigator ───────────────────────────────────────────────────────────

interface NavigatorItem {
  label?: string
}

export interface PreviewItemNavigatorProps {
  items: NavigatorItem[]
  activeIndex: number
  onSelect: (index: number) => void
}

/**
 * Previous · item menu · next, for multi-item previews. Same behavior as the overlays'
 * ItemNavigator (hidden for a single item, arrows clamp at the ends, the menu lists every item and
 * checks the active one), drawn with the header's icon buttons.
 */
export function PreviewItemNavigator({ items, activeIndex, onSelect }: PreviewItemNavigatorProps) {
  const { t } = useTranslation()
  const goToPrev = React.useCallback(() => {
    onSelect(Math.max(0, activeIndex - 1))
  }, [onSelect, activeIndex])

  const goToNext = React.useCallback(() => {
    onSelect(Math.min(items.length - 1, activeIndex + 1))
  }, [onSelect, activeIndex, items.length])

  if (items.length <= 1) return null

  const activeItem = items[activeIndex]
  const displayLabel = activeItem?.label || `${activeIndex + 1} / ${items.length}`

  return (
    <div className="flex items-center select-none">
      <PreviewBlockAction
        aria-label={t('overlay.previousItem')}
        icon={<ChevronLeft />}
        onClick={goToPrev}
        disabled={activeIndex === 0}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={t('overlay.selectItem')}
            className="motion-press inline-flex h-control-sm min-w-6 max-w-32 items-center justify-center rounded-sm px-1.5 text-label-sm text-secondary tabular-nums hover:bg-fill-hover hover:text-foreground active:bg-fill-pressed data-[state=open]:bg-fill-hover data-[state=open]:text-foreground in-data-compact:h-9 in-data-compact:min-w-9"
          >
            <span className="truncate">{displayLabel}</span>
          </button>
        </DropdownMenuTrigger>
        <StyledDropdownMenuContent align="center" className="max-h-64 overflow-y-auto" style={{ zIndex: 'var(--z-floating-menu, 400)' }}>
          {items.map((item, idx) => (
            <StyledDropdownMenuItem key={idx} onSelect={() => onSelect(idx)}>
              <span className="flex-1 truncate">{item.label || t('overlay.itemNumber', { number: idx + 1 })}</span>
              {idx === activeIndex && <Check className="size-3.5 text-accent" />}
            </StyledDropdownMenuItem>
          ))}
        </StyledDropdownMenuContent>
      </DropdownMenu>
      <PreviewBlockAction
        aria-label={t('overlay.nextItem')}
        icon={<ChevronRight />}
        onClick={goToNext}
        disabled={activeIndex === items.length - 1}
      />
    </div>
  )
}
