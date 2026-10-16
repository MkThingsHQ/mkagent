/**
 * Material for the composer's caret-anchored menus (/ commands, @ mentions, # labels) and the
 * permission-mode menu: floating surface (popover-styled = radius 12 + elev-2), 30px rows,
 * fill-hover highlight, secondary icons, tertiary section labels (design spec §7.10).
 */

/**
 * Floating menu surface. No enter animation: these menus open from typing (/, @, #), and keyboard
 * actions are instant (design spec §6.1). Pointer-opened menus use Radix data-state animations.
 */
export const INLINE_MENU_SURFACE = 'popover-styled overflow-hidden text-foreground'

/** Caret menus open upward from the caret, so they grow from their bottom-left corner. */
export const INLINE_MENU_ORIGIN = 'origin-bottom-left'

export const INLINE_MENU_LIST = 'max-h-[260px] overflow-y-auto p-1 scroll-py-1'

export const INLINE_MENU_ITEM =
  'flex min-h-row-menu cursor-pointer select-none items-center gap-2 rounded-md px-2 text-label text-foreground'

export const INLINE_MENU_ITEM_SELECTED = 'bg-fill-hover'

export const INLINE_MENU_SECTION_LABEL = 'px-2 pt-2 pb-1 text-label-sm font-medium text-tertiary select-none'

export const INLINE_MENU_SEPARATOR = 'bg-separator mx-1 my-1 h-px'

export const INLINE_MENU_FOOTER = 'flex items-center gap-2 px-3 py-2 text-label-sm text-tertiary select-none'
