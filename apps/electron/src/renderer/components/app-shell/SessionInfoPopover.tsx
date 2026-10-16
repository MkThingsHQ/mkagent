import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { useAppShellContext, useSession } from '@/context/AppShellContext'
import { cn } from '@/lib/utils'
import { SessionFilesSection } from '../right-sidebar/SessionFilesSection'

interface SessionInfoPopoverProps {
  sessionId: string
  sessionFolderPath?: string
  /** Opens the panel; omit it and drive `open` instead (the compact chat header opens it from its drawer) */
  trigger?: React.ReactElement
  /** Controlled open state; when omitted the component owns it */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  contentClassName?: string
  presentation?: 'popover' | 'drawer'
}

// The popover and sheet materials come from PopoverContent / DrawerContent; these only size them.
// The popover hugs its content up to 460px (the file list scrolls inside); a fixed height left a
// mostly empty card for sessions with few files.
const DEFAULT_POPOVER_CONTENT_CLASS = 'flex w-[360px] max-h-[460px] min-w-[200px] max-w-[420px] flex-col overflow-hidden p-0'
const DEFAULT_DRAWER_CONTENT_CLASS = 'overflow-hidden'

export function SessionInfoPopover({
  sessionId,
  sessionFolderPath,
  trigger,
  open: controlledOpen,
  onOpenChange,
  side = 'top',
  align = 'end',
  sideOffset = 6,
  contentClassName,
  presentation = 'popover',
}: SessionInfoPopoverProps) {
  const { t } = useTranslation()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(nextOpen)
    onOpenChange?.(nextOpen)

    if (!nextOpen) {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('craft:focus-input', {
          detail: { sessionId },
        }))
      })
    }
  }, [controlledOpen, onOpenChange, sessionId])

  if (presentation === 'drawer') {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange} direction="bottom">
        {trigger && (
          <DrawerTrigger asChild>
            {trigger}
          </DrawerTrigger>
        )}
        <DrawerContent
          className={cn(DEFAULT_DRAWER_CONTENT_CLASS, contentClassName)}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
          }}
        >
          <DrawerHeader className="border-b border-subtle px-4 py-3">
            <DrawerTitle>{t('chat.sessionInfo')}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <SessionInfoPopoverContent sessionId={sessionId} sessionFolderPath={sessionFolderPath} />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {trigger && (
        <PopoverTrigger asChild>
          {trigger}
        </PopoverTrigger>
      )}
      <PopoverContent
        className={contentClassName ?? DEFAULT_POPOVER_CONTENT_CLASS}
        side={side}
        align={align}
        sideOffset={sideOffset}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
        }}
      >
        <SessionInfoPopoverContent sessionId={sessionId} sessionFolderPath={sessionFolderPath} />
      </PopoverContent>
    </Popover>
  )
}

function SessionInfoPopoverContent({ sessionId, sessionFolderPath }: { sessionId: string; sessionFolderPath?: string }) {
  const { t } = useTranslation()
  const session = useSession(sessionId)
  const { onRenameSession } = useAppShellContext()
  const [name, setName] = React.useState('')
  const renameTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    setName(session?.name || '')
  }, [session?.name])

  React.useEffect(() => {
    return () => {
      if (renameTimeoutRef.current) {
        clearTimeout(renameTimeoutRef.current)
      }
    }
  }, [])

  const handleNameChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value
    setName(newName)

    if (renameTimeoutRef.current) {
      clearTimeout(renameTimeoutRef.current)
    }

    renameTimeoutRef.current = setTimeout(() => {
      const trimmed = newName.trim()
      if (trimmed) {
        onRenameSession(sessionId, trimmed)
      }
    }, 500)
  }, [onRenameSession, sessionId])

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* 16px insets, the same edge as the Session Files header and rows below */}
      <div className="shrink-0 px-4 py-3 border-b border-subtle">
        <label htmlFor={`session-info-title-${sessionId}`} className="text-label-sm font-medium text-secondary block mb-1.5 select-none">
          {t("chat.title")}
        </label>
        <Input
          id={`session-info-title-${sessionId}`}
          value={name}
          onChange={handleNameChange}
          placeholder={t("chat.titlePlaceholder")}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <SessionFilesSection
          sessionId={sessionId}
          sessionFolderPath={sessionFolderPath}
          hideHeader={false}
          className="h-full min-h-0"
        />
      </div>
    </div>
  )
}
