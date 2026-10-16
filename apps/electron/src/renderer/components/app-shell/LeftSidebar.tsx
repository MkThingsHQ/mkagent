import type { LucideIcon } from "lucide-react"
import * as React from "react"
import { motion, type Variants } from "motion/react"
import { ChevronRight } from "lucide-react"
import { TWEEN } from "@mkagent/ui/motion"

import { cn } from "@/lib/utils"
import {
  ContextMenu,
  ContextMenuTrigger,
  StyledContextMenuContent,
} from '@/components/ui/styled-context-menu'
import { ContextMenuProvider } from '@/components/ui/menu-context'
import { SidebarMenu, type SidebarMenuType } from './SidebarMenu'

/** Context menu configuration for sidebar items */
export interface SidebarContextMenuConfig {
  type: SidebarMenuType
  onMarkAllRead?: () => void
  onAddSkill?: () => void
}

export interface LinkItem {
  id: string            // Unique ID for navigation (e.g., 'nav:allSessions')
  title: string
  label?: string        // Optional badge (e.g., count)
  icon: LucideIcon | React.ReactNode  // LucideIcon or custom React element
  iconColor?: string    // Optional color class for the icon
  /** Whether the icon responds to color (uses currentColor). Default true for Lucide icons. */
  iconColorable?: boolean
  variant: "default" | "ghost"  // "default" = highlighted, "ghost" = subtle
  onClick?: () => void
  // Expandable item properties
  expandable?: boolean
  expanded?: boolean
  onToggle?: () => void
  items?: SidebarItem[]    // Subitems as data (rendered as nested LeftSidebar) - supports separators
  // Compact mode: reduced vertical padding (4px less total height)
  compact?: boolean
  // Tutorial system
  dataTutorial?: string // data-tutorial attribute for tutorial targeting
  // Context menu configuration (optional - if provided, right-click shows context menu)
  contextMenu?: SidebarContextMenuConfig
  // Optional element rendered after the title (e.g., label type icon), revealed on hover
  afterTitle?: React.ReactNode
}

export interface SeparatorItem {
  id: string
  type: 'separator'
}

/** A quiet group heading (e.g. "Workspace") — not focusable, not part of keyboard navigation. */
export interface SectionItem {
  id: string
  type: 'section'
  title: string
}

export type SidebarItem = LinkItem | SeparatorItem | SectionItem

export const isSeparatorItem = (item: SidebarItem): item is SeparatorItem =>
  'type' in item && item.type === 'separator'

export const isSectionItem = (item: SidebarItem): item is SectionItem =>
  'type' in item && item.type === 'section'

const isLinkItem = (item: SidebarItem): item is LinkItem => !('type' in item)

interface LeftSidebarProps {
  isCollapsed: boolean
  links: SidebarItem[]
  /** Get props for each item (from unified sidebar navigation) */
  getItemProps?: (id: string) => {
    tabIndex: number
    'data-focused': boolean
    ref: (el: HTMLElement | null) => void
  }
  /** Currently focused item ID */
  focusedItemId?: string | null
  /** Whether this is a nested sidebar (child of expandable item) */
  isNested?: boolean
  /** Nesting depth (0 = top level). Nested rows indent their content, never their fill. */
  depth?: number
  /** Extra classes for the outer wrapper (e.g. the pinned footer drops the top padding) */
  className?: string
}

/**
 * Layout grid: a row's glyph sits on the sidebar gutter (8px nav inset + 8px row padding = 16px).
 * A child row indents by one glyph step (16px glyph + 8px gap) so its glyph lands on the parent's
 * label edge. The fill stays full width at every depth.
 */
const SIDEBAR_ROW_PADDING = 8
const SIDEBAR_INDENT = 24

/** Children of an expanded item fade in, the first few staggered (spec §6.1: 25ms × ≤ 6 on first reveal). */
const STAGGER_LIMIT = 6
const STAGGER_SECONDS = 0.025

const itemVariants: Variants = {
  hidden: { opacity: 0, y: -4 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { ...TWEEN.fast, delay: Math.min(index, STAGGER_LIMIT) * STAGGER_SECONDS },
  }),
}

/**
 * LeftSidebar - Vertical list of navigation rows (spec §7.1: 28px rows on the navigator canvas).
 *
 * Navigation is managed by the parent component (AppShell) for unified sidebar keyboard
 * navigation. This component just renders the items.
 *
 * Row anatomy: 16px icon (tertiary; the row's text color when selected) · label (13px, secondary;
 * primary when selected) · count (12px, tertiary). Selection is a fill, never weight.
 *
 * Expandable items:
 * - Show a chevron toggle on hover (replaces icon position)
 * - Children appear in one layout change (no height animation) and fade in, staggered
 *
 */
export function LeftSidebar({ links, isCollapsed: _isCollapsed, getItemProps, focusedItemId, isNested, depth = 0, className }: LeftSidebarProps) {
  let linkIndex = -1
  return (
    <div className={cn("flex flex-col select-none", !isNested && "py-1", className)}>
      <nav
        className={cn("grid gap-px", !isNested && "px-2")}
        aria-label={isNested ? "Sub navigation" : "Main navigation"}
      >
        {links.map((item) => {
          if (isSeparatorItem(item)) {
            // Dividers start where their rows' glyphs start (indented with nested rows)
            return (
              <div key={item.id} className="py-1.5 pr-2" style={{ paddingLeft: SIDEBAR_ROW_PADDING + depth * SIDEBAR_INDENT }} aria-hidden="true">
                <div className="h-px bg-separator" />
              </div>
            )
          }

          if (isSectionItem(item)) {
            return (
              <div
                key={item.id}
                className="flex h-row-sidebar items-center px-2 mt-3 text-label-sm font-medium text-tertiary"
              >
                {item.title}
              </div>
            )
          }

          linkIndex += 1
          const link = item
          const itemProps = getItemProps?.(link.id)

          const buttonElement = (
            <SidebarButton
              link={link}
              itemProps={itemProps}
              depth={depth}
            />
          )

          const expandedContent = link.expandable && link.items && link.expanded
            ? renderExpandedContent(link, getItemProps, focusedItemId, depth + 1)
            : null

          // Wrap with context menu if configured, scoped to button only.
          // ContextMenuTrigger with asChild sets data-state="open" on the button
          // so only the clicked item highlights, not the entire section.
          const content = (
            <div className="group/section">
              {link.contextMenu ? (
                <ContextMenu modal={true}>
                  <ContextMenuTrigger asChild>
                    {buttonElement}
                  </ContextMenuTrigger>
                  <StyledContextMenuContent>
                    <ContextMenuProvider>
                      <SidebarMenu
                        type={link.contextMenu.type}
                        onMarkAllRead={link.contextMenu.onMarkAllRead}
                        onAddSkill={link.contextMenu.onAddSkill}
                      />
                    </ContextMenuProvider>
                  </StyledContextMenuContent>
                </ContextMenu>
              ) : (
                buttonElement
              )}
              {/* Expandable subitems — outside context menu scope so only the clicked button
                * gets data-state="open". The layout changes once; the rows themselves fade in. */}
              {expandedContent && (
                <div className={cn("mt-px", isNested ? "mb-1" : "mb-1.5")}>
                  {expandedContent}
                </div>
              )}
            </div>
          )

          // Nested items fade in on first reveal (staggered, capped)
          return isNested ? (
            <motion.div key={link.id} variants={itemVariants} initial="hidden" animate="visible" custom={linkIndex}>
              {content}
            </motion.div>
          ) : (
            <React.Fragment key={link.id}>
              {content}
            </React.Fragment>
          )
        })}
      </nav>
    </div>
  )
}

// ============================================================
// Expanded Content Renderer
// Renders regular nested sidebar content.
// ============================================================

function renderExpandedContent(
  link: LinkItem,
  getItemProps: LeftSidebarProps['getItemProps'],
  focusedItemId: string | null | undefined,
  depth: number,
): React.ReactNode {
  return (
    <LeftSidebar
      isCollapsed={false}
      isNested={true}
      depth={depth}
      getItemProps={getItemProps}
      focusedItemId={focusedItemId}
      links={link.items!}
    />
  )
}

// ============================================================
// SidebarButton - Extracted button component
// ============================================================

interface SidebarButtonProps {
  link: LinkItem
  itemProps?: {
    tabIndex: number
    'data-focused': boolean
    ref: (el: HTMLElement | null) => void
  }
  /** True when rendering inside the DragOverlay (floating clone) */
  isOverlay?: boolean
  /** Nesting depth: indents the row's content (not its fill) by one glyph step per level */
  depth?: number
}

// forwardRef is required so Radix's ContextMenuTrigger (asChild) can attach its ref
// and pass props like data-state="open" directly onto this button element.
const SidebarButton = React.forwardRef<HTMLButtonElement, SidebarButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ link, itemProps, isOverlay, depth = 0, className: extraClassName, style, ...radixProps }, forwardedRef) => {
    const isSelected = link.variant === "default"
    return (
      <button
        {...(isOverlay ? {} : (() => {
          // Separate ref from itemProps so we can merge it with forwardedRef
          const { ref: _itemRef, ...rest } = itemProps || { ref: undefined }
          return rest
        })())}
        // Spread Radix props (data-state, onContextMenu, onPointerDown, etc.)
        {...radixProps}
        ref={(el) => {
          // Merge forwarded ref (from Radix) and itemProps ref (for keyboard nav)
          if (typeof forwardedRef === 'function') forwardedRef(el)
          else if (forwardedRef) forwardedRef.current = el
          if (!isOverlay && itemProps?.ref) itemProps.ref(el)
        }}
        onClick={isOverlay ? undefined : link.onClick}
        data-tutorial={link.dataTutorial}
        aria-current={isSelected ? "page" : undefined}
        style={{ ...style, paddingLeft: SIDEBAR_ROW_PADDING + depth * SIDEBAR_INDENT }}
        className={cn(
          // 28px row (24px for `compact` items), 13px label; the focus ring sits inside the
          // scrolling sidebar so it isn't clipped.
          "group flex w-full items-center gap-2 rounded-sm pr-2 text-label text-left select-none -outline-offset-2",
          link.compact ? "h-control-sm" : "h-row-sidebar",
          // Hover-in instant, hover-out 100ms
          "transition-[background-color,color] duration-micro ease-out-subtle hover:duration-instant",
          isSelected
            ? "bg-fill-selected text-foreground"
            // Highlight on hover, context menu open (data-state), or EditPopover active (data-edit-active)
            : "text-secondary hover:bg-fill-hover hover:text-foreground data-[state=open]:bg-fill-hover data-[edit-active=true]:bg-fill-hover",
          extraClassName,
        )}
      >
        {/* Icon container with hover toggle for expandable items */}
        <span className="relative size-4 shrink-0 flex items-center justify-center">
          {link.expandable && !isOverlay ? (
            <>
              {/* Main icon - hidden on hover */}
              <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-micro group-hover:opacity-0 group-hover:duration-instant">
                {renderIcon(link)}
              </span>
              {/* Toggle chevron - shown on hover. data-no-dnd prevents drag activation on click. */}
              <span
                className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-micro group-hover:opacity-100 group-hover:duration-instant cursor-pointer"
                data-no-dnd="true"
                data-touch-reveal="true"
                onClick={(e) => {
                  e.stopPropagation()
                  link.onToggle?.()
                }}
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 text-tertiary transition-transform duration-[var(--spring-snap-dur)] ease-[var(--spring-snap)]",
                    link.expanded && "rotate-90"
                  )}
                />
              </span>
            </>
          ) : (
            renderIcon(link)
          )}
        </span>
        {/* One line: long names (e.g. page titles) end in "…", the full name shows on hover */}
        <span className="min-w-0 flex-1 truncate" title={link.title}>{link.title}</span>
        {/* After-title element: type indicator icon, right-aligned before the count, revealed on hover */}
        {link.afterTitle && (
          <span data-touch-reveal="true" className="shrink-0 opacity-0 transition-opacity duration-micro group-hover/section:opacity-100 group-data-[state=open]:opacity-100 group-data-[edit-active=true]:opacity-100">
            {link.afterTitle}
          </span>
        )}
        {/* Count — quiet (12px tertiary, tabular); an empty row shows none rather than a column of 0s */}
        {link.label && link.label !== '0' && (
          <span className="shrink-0 text-label-sm text-tertiary tabular-nums">
            {link.label}
          </span>
        )}
      </button>
    )
  }
)

/**
 * Helper to render icon - either component (function/forwardRef) or React element.
 * Colors are applied via inline style (resolved CSS color strings from EntityColor); icons without
 * their own color use the tertiary text role, or the row's text color when the row is selected.
 */
function renderIcon(link: LinkItem) {
  const isComponent = typeof link.icon === 'function' ||
    (typeof link.icon === 'object' && link.icon !== null && 'render' in link.icon)
  const defaultColor = link.variant === 'default' ? 'var(--text)' : 'var(--text-tertiary)'

  // Lucide components are always colorable; ReactNode icons check iconColorable
  // Default to true for backwards compatibility (most icons are colorable)
  const applyColor = link.iconColorable !== false
  const colorStyle = applyColor ? { color: link.iconColor || defaultColor } : undefined

  if (isComponent) {
    const Icon = link.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>
    return (
      <Icon
        className="size-4 shrink-0"
        style={colorStyle}
      />
    )
  }
  // Already a React element or primitive ReactNode
  // Clone with bare={true} to remove EntityIcon container, wrapper provides sizing
  // Only pass bare to components that accept it (have acceptsBare marker) to avoid
  // forwarding unknown props to DOM elements (e.g., Lucide icons → SVG)
  const iconElement = link.icon as React.ReactNode
  const bareIcon = React.isValidElement(iconElement)
    ? (typeof iconElement.type === 'function' && (iconElement.type as { acceptsBare?: boolean }).acceptsBare)
      ? React.cloneElement(iconElement as React.ReactElement<{ bare?: boolean }>, { bare: true })
      : iconElement
    : iconElement
  return (
    <span
      className="size-4 shrink-0 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
      style={colorStyle}
    >
      {bareIcon}
    </span>
  )
}
