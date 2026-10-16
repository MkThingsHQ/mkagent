import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/**
 * Command palette primitives (cmdk) on the floating material (design spec §7.9):
 * 52px input with 16px text, 38px rows, a 2px accent bar on the selected row.
 */
function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-[inherit] bg-floating text-foreground',
        className
      )}
      {...props}
    />
  )
}

interface CommandDialogProps extends React.ComponentProps<typeof Dialog> {
  /** Accessible title for the dialog (visually hidden) */
  title: string
  /** Opened from the keyboard (⌘K): appear instantly; pointer opens get a 120ms fade + scale. */
  openedWithKeyboard?: boolean
  className?: string
}

function CommandDialog({
  children,
  title,
  openedWithKeyboard = false,
  className,
  ...props
}: CommandDialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn('motion-palette top-[20%] translate-y-0 overflow-hidden p-0 sm:max-w-[640px]', className)}
        data-motion-instant={openedWithKeyboard || undefined}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Command>{children}</Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex h-13 items-center gap-2.5 border-b border-subtle px-4" data-slot="command-input-wrapper">
      <Search className="size-4 shrink-0 text-tertiary" aria-hidden />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          'h-full w-full bg-transparent text-copy-lg outline-none placeholder:text-tertiary disabled:cursor-not-allowed disabled:text-disabled',
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn('max-h-80 scroll-py-1 overflow-y-auto overflow-x-hidden p-1', className)}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn('py-6 text-center text-label text-tertiary', className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'overflow-hidden text-foreground [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-label-sm [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-tertiary',
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('-mx-1 my-1 h-px bg-separator', className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        'relative flex min-h-9.5 cursor-default items-center gap-2.5 rounded-md px-2.5 text-label outline-none select-none',
        'before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full data-[selected=true]:bg-fill-hover data-[selected=true]:before:bg-accent-solid',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:text-disabled',
        '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4 [&_svg:not([class*=text-])]:text-secondary',
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn('ml-auto flex items-center gap-0.5 text-label-sm text-tertiary', className)}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
}
