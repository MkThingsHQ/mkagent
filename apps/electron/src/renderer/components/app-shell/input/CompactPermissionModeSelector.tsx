import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import type { PermissionMode } from '@mkagent/shared/agent/modes'
import { useAvailablePermissionModes } from '@/hooks/useAvailablePermissionModes'
import { PermissionModeIcon as ModeIcon } from '@/components/ui/slash-command-menu'
import { MODE_CHIP_TONE, MODE_ICON_TONE, knownMode } from './composer-styles'

// Localized labels for each mode (PERMISSION_MODE_CONFIG carries English-only
// displayName/shortName/description — render via these keys instead).
const MODE_LABEL_KEYS: Record<PermissionMode, { name: string; short: string; desc: string }> = {
  'safe': { name: 'mode.explore', short: 'mode.exploreShort', desc: 'mode.exploreFullDesc' },
  'ask': { name: 'mode.askToEdit', short: 'mode.askToEditShort', desc: 'mode.askFullDesc' },
  'allow-all': { name: 'mode.execute', short: 'mode.executeShort', desc: 'mode.executeFullDesc' },
}

// ============================================================================
// Component
// ============================================================================

interface CompactPermissionModeSelectorProps {
  permissionMode: PermissionMode
  onPermissionModeChange?: (mode: PermissionMode) => void
}

export function CompactPermissionModeSelector({
  permissionMode,
  onPermissionModeChange,
}: CompactPermissionModeSelectorProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  // Optimistic local state — updates immediately, syncs with prop
  const [optimisticMode, setOptimisticMode] = React.useState(permissionMode)

  React.useEffect(() => {
    setOptimisticMode(permissionMode)
  }, [permissionMode])

  const handleSelect = React.useCallback((mode: PermissionMode) => {
    setOptimisticMode(mode)
    onPermissionModeChange?.(mode)
    setOpen(false)
  }, [onPermissionModeChange])

  // A mode this build does not know (newer server) renders as Ask instead of crashing the input
  const shownMode: PermissionMode = knownMode(optimisticMode)
  // Guarded is listed only while its decision-model feature is on (or it is the current mode)
  const modes = useAvailablePermissionModes(optimisticMode)

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={`${t('mode.permissionMode')}: ${t(MODE_LABEL_KEYS[shownMode].name)}`}
          data-mode={shownMode}
          className={cn(
            "input-toolbar-btn motion-press state-overlay flex h-control shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-label font-medium select-none",
            "@min-[24rem]/panel:pr-3",
            MODE_CHIP_TONE[shownMode],
          )}
        >
          <ModeIcon mode={shownMode} className="size-3.5 shrink-0" />
          {/* Narrow phones keep the tinted icon only (the card sits on the 16px gutter, so a 420px
              screen gives it 388px; 24rem is the narrowest card the named chip fits) so
              attach · sources · folder · mode · model · Send fit on one row; the mode name stays
              in the aria-label and the drawer. */}
          <span className="sr-only @min-[24rem]/panel:not-sr-only">{t(MODE_LABEL_KEYS[shownMode].short)}</span>
        </button>
      </DrawerTrigger>

      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t('mode.permissionMode')}</DrawerTitle>
        </DrawerHeader>

        {/* Rows sit on the title's 16px edge: 8px container inset + 8px row padding */}
        <div className="px-2 pb-6 flex flex-col gap-1">
          {modes.map((mode) => {
            const isSelected = mode === optimisticMode
            return (
              <DrawerClose asChild key={mode}>
                <button
                  type="button"
                  className={cn(
                    "flex min-h-row-touch w-full shrink-0 items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:duration-instant",
                    isSelected ? "bg-fill-selected" : "hover:bg-fill-hover active:bg-fill-pressed",
                  )}
                  onClick={() => handleSelect(mode)}
                >
                  <span className={cn("shrink-0", MODE_ICON_TONE[knownMode(mode)])}>
                    <ModeIcon mode={mode} className="size-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-copy font-medium">{t(MODE_LABEL_KEYS[mode].name)}</div>
                    <div className="text-label text-tertiary">{t(MODE_LABEL_KEYS[mode].desc)}</div>
                  </div>
                  {isSelected && (
                    <Check className="size-4 shrink-0 text-secondary" />
                  )}
                </button>
              </DrawerClose>
            )
          })}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
