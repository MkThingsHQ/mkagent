/**
 * StyledDropdown - Shared styled dropdown components
 *
 * Pre-styled Radix dropdown wrappers on the floating material (design spec §7.10):
 * - popover-styled: --surface-floating, radius 12, elev-2; motion-popover enter/exit
 * - 30px rows, 13px labels, fill-hover highlight, 16px secondary-colored icons
 *
 * Wraps raw @radix-ui/react-dropdown-menu primitives with the full class set
 * (shadcn base layer + styled additions) so consumers get the correct look
 * without depending on the shadcn wrapper layer in apps/electron.
 */

import * as React from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { ChevronRightIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

const SUPPORTED_HOVER_PREFIXES = ['bg-', 'text-', 'border-', 'ring-', 'opacity-']

/**
 * Mirror hover styles to open-state styles for Radix triggers.
 *
 * Example:
 * - hover:bg-foreground/5 -> data-[state=open]:bg-foreground/5
 *
 * Consumers can still provide explicit data-[state=open]:* classes to override.
 */
export function mirrorHoverToOpenStateClasses(className?: string): string | undefined {
  if (!className) return className

  const tokens = className.trim().split(/\s+/)
  const mirrored: string[] = []

  for (const token of tokens) {
    if (!token.includes('hover:')) continue

    const hoverIdx = token.indexOf('hover:')
    const afterHover = token.slice(hoverIdx + 'hover:'.length)
    const utility = afterHover.includes(':') ? afterHover.slice(afterHover.lastIndexOf(':') + 1) : afterHover

    if (!SUPPORTED_HOVER_PREFIXES.some(prefix => utility.startsWith(prefix))) continue

    mirrored.push(token.replace('hover:', 'data-[state=open]:'))
  }

  return cn(...mirrored, className)
}

// Re-export raw primitives that need no styling
const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuSub = DropdownMenuPrimitive.Sub

interface DropdownMenuTriggerProps extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger> {
  /** Auto-mirror hover:* classes to data-[state=open]:* while menu is open. Default: true */
  autoMirrorHoverToOpen?: boolean
}

const DropdownMenuTrigger = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Trigger>,
  DropdownMenuTriggerProps
>(({ className, autoMirrorHoverToOpen = true, asChild, children, ...props }, ref) => {
  const triggerClassName = autoMirrorHoverToOpen ? mirrorHoverToOpenStateClasses(className) : className

  if (asChild && autoMirrorHoverToOpen && React.isValidElement(children)) {
    const childClassName = (children.props as { className?: string }).className
    const mergedChildClassName = mirrorHoverToOpenStateClasses(cn(childClassName, className))

    return (
      <DropdownMenuPrimitive.Trigger
        ref={ref}
        asChild
        {...props}
      >
        {React.cloneElement(children as React.ReactElement<{ className?: string }>, {
          className: mergedChildClassName,
        })}
      </DropdownMenuPrimitive.Trigger>
    )
  }

  return (
    <DropdownMenuPrimitive.Trigger
      ref={ref}
      asChild={asChild}
      className={triggerClassName}
      {...props}
    >
      {children}
    </DropdownMenuPrimitive.Trigger>
  )
})
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger'

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuSub }

// ── Content ──────────────────────────────────────────────────────────────────

interface StyledDropdownMenuContentProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> {
  minWidth?: string
  /** Force light mode instead of dark */
  light?: boolean
}

export const StyledDropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Content>,
  StyledDropdownMenuContentProps
>(({ className, minWidth = 'min-w-40', light = false, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'popover-styled motion-popover overflow-x-hidden overflow-y-auto p-1 z-dropdown',
        'max-h-(--radix-dropdown-menu-content-available-height)',
        'origin-(--radix-dropdown-menu-content-transform-origin)',
        'w-fit font-sans whitespace-nowrap flex flex-col',
        minWidth,
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
StyledDropdownMenuContent.displayName = 'StyledDropdownMenuContent'

// ── Item ─────────────────────────────────────────────────────────────────────

interface StyledDropdownMenuItemProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> {
  variant?: 'default' | 'destructive'
}

export const StyledDropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Item>,
  StyledDropdownMenuItemProps
>(({ className, variant = 'default', ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex min-h-row-menu cursor-default items-center gap-2 rounded-md px-2 pr-3 text-label outline-hidden select-none',
      'hover:bg-fill-hover focus:bg-fill-hover',
      'data-[disabled]:pointer-events-none data-[disabled]:text-disabled',
      "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>svg:not([class*='text-'])]:text-secondary",
      variant === 'destructive' && 'text-destructive hover:bg-destructive-tint focus:bg-destructive-tint [&_svg]:!text-destructive',
      className,
    )}
    {...props}
  />
))
StyledDropdownMenuItem.displayName = 'StyledDropdownMenuItem'

// ── Separator ────────────────────────────────────────────────────────────────

export const StyledDropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('bg-separator -mx-1 my-1 h-px', className)}
    {...props}
  />
))
StyledDropdownMenuSeparator.displayName = 'StyledDropdownMenuSeparator'

// ── Sub-menu trigger ─────────────────────────────────────────────────────────

export const StyledDropdownMenuSubTrigger = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      'relative flex min-h-row-menu cursor-default items-center gap-2 rounded-md px-2 pr-1.5 text-label outline-hidden select-none',
      'hover:bg-fill-hover focus:bg-fill-hover data-[state=open]:bg-fill-hover',
      "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>svg:not([class*='text-'])]:text-secondary",
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRightIcon className="ml-auto size-4 text-tertiary" />
  </DropdownMenuPrimitive.SubTrigger>
))
StyledDropdownMenuSubTrigger.displayName = 'StyledDropdownMenuSubTrigger'

// ── Sub-menu content ─────────────────────────────────────────────────────────

interface StyledDropdownMenuSubContentProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent> {
  minWidth?: string
}

export const StyledDropdownMenuSubContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.SubContent>,
  StyledDropdownMenuSubContentProps
>(({ className, minWidth = 'min-w-36', sideOffset = -4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'popover-styled motion-popover w-fit font-sans whitespace-nowrap flex flex-col z-dropdown overflow-x-hidden overflow-y-auto p-1',
        'max-h-(--radix-dropdown-menu-content-available-height)',
        'origin-(--radix-dropdown-menu-content-transform-origin)',
        minWidth,
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
StyledDropdownMenuSubContent.displayName = 'StyledDropdownMenuSubContent'

// ── Shortcut ─────────────────────────────────────────────────────────────────

export function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('ml-auto pl-4 text-label-sm text-tertiary', className)}
      {...props}
    />
  )
}
