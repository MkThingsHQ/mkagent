import type { LucideIcon } from "lucide-react"
import * as React from "react"
import { AnimatePresence, motion, type Variants } from "motion/react"
import { ChevronRight } from "lucide-react"

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

export type SidebarItem = LinkItem | SeparatorItem

export const isSeparatorItem = (item: SidebarItem): item is SeparatorItem =>
  'type' in item && item.type === 'separator'

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
}

// Stagger animation for child items
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.025,
      delayChildren: 0.01,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.015,
      staggerDirection: -1,
    },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.15, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    x: -8,
    transition: { duration: 0.1, ease: 'easeIn' },
  },
}

/**
 * LeftSidebar - Vertical list of navigation buttons with icons
 *
 * Navigation is managed by the parent component (Chat.tsx) for unified
 * sidebar keyboard navigation. This component just renders the items.
 *
 * Styling matches agent items in the sidebar for consistency:
 * - py-[7px] px-2 text-[13px] rounded-md
 * - Icon: h-3.5 w-3.5
 *
 * Link variants:
 * - "default": Highlighted style (used for active/selected items)
 * - "ghost": Subtle style (used for inactive items)
 *
 * Expandable items:
 * - Show a chevron toggle on hover (replaces icon position)
 * - Children are rendered with animated expand/collapse
 * - Nested items have left indentation with vertical line
 *
 */
export function LeftSidebar({ links, isCollapsed, getItemProps, focusedItemId, isNested }: LeftSidebarProps) {
  // For nested sidebars, wrap in motion container for stagger effect
  const NavWrapper = isNested ? motion.nav : 'nav'
  const navProps = isNested ? {
    variants: containerVariants,
    initial: 'hidden',
    animate: 'visible',
    exit: 'exit',
  } : {}

  return (
    <div className={cn("flex flex-col select-none", !isNested && "py-1")}>
      <NavWrapper
        className={cn(
          "grid gap-0.5",
          isNested ? "pl-5 pr-0 relative" : "px-2"
        )}
        role="navigation"
        aria-label={isNested ? "Sub navigation" : "Main navigation"}
        {...navProps}
      >
        {/* Vertical line for nested items - 4px left of chevron center */}
        {isNested && (
          <div
            className="absolute left-[13px] top-1 bottom-1 w-px bg-foreground/10"
            aria-hidden="true"
          />
        )}
        {links.map((item) => {
          // Handle separator items
          if (isSeparatorItem(item)) {
            return (
              <div key={item.id} className="py-1 px-2" aria-hidden="true">
                <div className="h-px bg-foreground/5" />
              </div>
            )
          }

          const link = item
          const itemProps = getItemProps?.(link.id)
          const isFocused = focusedItemId === link.id

          // Button element shared by both expandable and non-expandable items
          const buttonElement = (
            <SidebarButton
              link={link}
              itemProps={itemProps}
            />
          )

          // Determine which expanded content to render (sortable vs regular)
          const expandedContent = link.expandable && link.items && link.expanded
            ? renderExpandedContent(link, getItemProps, focusedItemId, isNested)
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
              {/* Expandable subitems — outside context menu scope so only the
                * clicked button gets data-state="open", not nested children */}
              {link.expandable && link.items && (
                <AnimatePresence initial={false}>
                  {link.expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0, marginTop: 0, marginBottom: 0 }}
                      animate={{ height: 'auto', opacity: 1, marginTop: 2, marginBottom: isNested ? 4 : 8 }}
                      exit={{ height: 0, opacity: 0, marginTop: 0, marginBottom: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      {expandedContent}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          )

          // For nested items, wrap in motion.div for stagger animation
          return isNested ? (
            <motion.div key={link.id} variants={itemVariants}>
              {content}
            </motion.div>
          ) : (
            <React.Fragment key={link.id}>
              {content}
            </React.Fragment>
          )
        })}
      </NavWrapper>
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
  isNested: boolean | undefined
): React.ReactNode {
  return (
    <LeftSidebar
      isCollapsed={false}
      isNested={true}
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
}

// forwardRef is required so Radix's ContextMenuTrigger (asChild) can attach its ref
// and pass props like data-state="open" directly onto this button element.
const SidebarButton = React.forwardRef<HTMLButtonElement, SidebarButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ link, itemProps, isOverlay, className: extraClassName, ...radixProps }, forwardedRef) => {
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
        className={cn(
          "group flex w-full items-center gap-2 rounded-[6px] text-[13px] select-none outline-none",
          "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
          // Compact mode: 4px less total height (py-[3px] vs py-[5px])
          link.compact ? "py-[3px]" : "py-[5px]",
          "px-2",
          link.variant === "default"
            ? "bg-foreground/[0.07]"
            // Highlight on hover, context menu open (data-state), or EditPopover active (data-edit-active)
            : "hover:bg-sidebar-hover data-[state=open]:bg-sidebar-hover data-[edit-active=true]:bg-sidebar-hover",
          extraClassName,
        )}
      >
        {/* Icon container with hover toggle for expandable items */}
        <span className="relative h-3.5 w-3.5 shrink-0 flex items-center justify-center">
          {link.expandable && !isOverlay ? (
            <>
              {/* Main icon - hidden on hover */}
              <span className="absolute inset-0 flex items-center justify-center group-hover:opacity-0 transition-opacity duration-150">
                {renderIcon(link)}
              </span>
              {/* Toggle chevron - shown on hover. data-no-dnd prevents drag activation on click. */}
              <span
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 cursor-pointer"
                data-no-dnd="true"
                data-touch-reveal="true"
                onClick={(e) => {
                  e.stopPropagation()
                  link.onToggle?.()
                }}
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                    link.expanded && "rotate-90"
                  )}
                />
              </span>
            </>
          ) : (
            renderIcon(link)
          )}
        </span>
        {link.title}
        {/* After-title element: type indicator icon, right-aligned before count badge, revealed on hover */}
        {link.afterTitle && (
          <span data-touch-reveal="true" className="ml-auto opacity-0 group-hover/section:opacity-100 group-data-[state=open]:opacity-100 group-data-[edit-active=true]:opacity-100 transition-opacity">
            {link.afterTitle}
          </span>
        )}
        {/* Label Badge: Shows count or status on the right, revealed on section hover */}
        {link.label && (
          <span data-touch-reveal="true" className={cn(link.afterTitle ? 'ml-0' : 'ml-auto', 'text-xs text-foreground/30 opacity-0 group-hover/section:opacity-100 group-data-[state=open]:opacity-100 group-data-[edit-active=true]:opacity-100 transition-opacity')}>
            {link.label}
          </span>
        )}
      </button>
    )
  }
)

/**
 * Helper to render icon - either component (function/forwardRef) or React element.
 * Colors are always applied via inline style (resolved CSS color strings from EntityColor).
 */
function renderIcon(link: LinkItem) {
  const isComponent = typeof link.icon === 'function' ||
    (typeof link.icon === 'object' && link.icon !== null && 'render' in link.icon)
  // Default color for items without explicit iconColor (foreground at 60% opacity)
  const defaultColor = 'color-mix(in oklch, var(--foreground) 60%, transparent)'

  // Lucide components are always colorable; ReactNode icons check iconColorable
  // Default to true for backwards compatibility (most icons are colorable)
  const applyColor = link.iconColorable !== false
  const colorStyle = applyColor ? { color: link.iconColor || defaultColor } : undefined

  if (isComponent) {
    const Icon = link.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>
    return (
      <Icon
        className="h-3.5 w-3.5 shrink-0"
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
      className="h-3.5 w-3.5 shrink-0 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
      style={colorStyle}
    >
      {bareIcon}
    </span>
  )
}
