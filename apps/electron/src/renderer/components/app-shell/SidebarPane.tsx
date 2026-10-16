/**
 * SidebarPane — the left sidebar's frame (design spec §7.1): New session on top, the scrolling
 * navigation, and a pinned footer (Settings, What's New) that stays visible at any window height.
 * Flush on the navigator canvas — no card. Presentational: AppShell owns the links and handlers.
 */

import * as React from "react"
import { SquarePenRounded } from "../icons/SquarePenRounded"
import {
  ContextMenu,
  ContextMenuTrigger,
  StyledContextMenuContent,
} from "@/components/ui/styled-context-menu"
import { ContextMenuProvider } from "@/components/ui/menu-context"
import { HotkeyKeycaps } from "@/components/ui/hotkey-keycaps"
import { SidebarMenu } from "./SidebarMenu"
import { LeftSidebar, type SidebarItem } from "./LeftSidebar"

interface SidebarPaneProps {
  paneRef: React.Ref<HTMLDivElement>
  width: number
  /** Sidebar is the active keyboard zone (roving tab stop) */
  focused: boolean
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>
  /** Scrolling navigation */
  links: SidebarItem[]
  /** Pinned below the scrolling navigation */
  footerLinks: SidebarItem[]
  getItemProps?: React.ComponentProps<typeof LeftSidebar>["getItemProps"]
  focusedItemId?: string | null
  /** `openInNewWindow` is true for ⌘/Ctrl-click (same as before: Gmail-style compose) */
  onNewSession: (openInNewWindow: boolean) => void
  newSessionLabel: string
  newSessionHotkey: string | null
}

export function SidebarPane({
  paneRef,
  width,
  focused,
  onKeyDown,
  links,
  footerLinks,
  getItemProps,
  focusedItemId,
  onNewSession,
  newSessionLabel,
  newSessionHotkey,
}: SidebarPaneProps) {
  return (
    <div
      ref={paneRef}
      style={{ width }}
      className="h-full font-sans relative"
      data-focus-zone="sidebar"
      tabIndex={focused ? 0 : -1}
      onKeyDown={onKeyDown}
    >
      <div className="flex h-full flex-col select-none">
        {/* New session — a sidebar row with its shortcut shown on hover; right-click for "Open in New Window" */}
        {/* pt-2.5 centres the first row on the panel headers (48px tall, starting at the same y) */}
        <div className="px-2 pt-2.5 pb-1.5 shrink-0">
          <ContextMenu modal={true}>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => onNewSession(e.metaKey || e.ctrlKey)}
                data-tutorial="new-chat-button"
                className="group flex h-row-sidebar w-full items-center gap-2 rounded-sm px-2 text-label text-foreground select-none transition-[background-color] duration-micro ease-out-subtle hover:bg-fill-hover hover:duration-instant data-[state=open]:bg-fill-hover"
              >
                <SquarePenRounded className="size-4 shrink-0 text-secondary" />
                <span className="flex-1 min-w-0 truncate text-left">{newSessionLabel}</span>
                <HotkeyKeycaps
                  hotkey={newSessionHotkey}
                  className="opacity-0 transition-opacity duration-micro group-hover:opacity-100 group-hover:duration-instant group-focus-visible:opacity-100"
                />
              </button>
            </ContextMenuTrigger>
            <StyledContextMenuContent>
              <ContextMenuProvider>
                <SidebarMenu type="newSession" />
              </ContextMenuProvider>
            </StyledContextMenuContent>
          </ContextMenu>
        </div>

        {/* Navigation. pb-4 keeps the last row clear of the mask-fade-bottom gradient. */}
        <div className="flex-1 overflow-y-auto min-h-0 mask-fade-bottom pb-4 scrollbar-hide">
          <LeftSidebar
            isCollapsed={false}
            getItemProps={getItemProps}
            focusedItemId={focusedItemId}
            links={links}
          />
        </div>

        {footerLinks.length > 0 && (
          <div className="shrink-0 pb-1.5">
            <div className="mx-4 h-px bg-separator" aria-hidden="true" />
            <LeftSidebar
              isCollapsed={false}
              getItemProps={getItemProps}
              focusedItemId={focusedItemId}
              links={footerLinks}
              className="pt-1.5 pb-0"
            />
          </div>
        )}
      </div>
    </div>
  )
}
