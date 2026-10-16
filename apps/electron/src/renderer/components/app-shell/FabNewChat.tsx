import { createPortal } from "react-dom"
import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

interface FabNewChatProps {
  onClick: () => void
  className?: string
}

/**
 * Floating action button for creating a new chat on compact/mobile layouts.
 * Bottom-right, thumb-reach. Hidden on desktop — the top-bar menu + ⌘N handle it there.
 *
 * Rendered through a portal to `document.body` so `position: fixed` is truly
 * viewport-relative. Without the portal, the FAB lives inside the navigator
 * panel which is wrapped in a transformed `motion.div` (CompactPanelTransition),
 * and any ancestor with `transform` becomes the containing block for `fixed`
 * descendants — the FAB would otherwise pin to the top of the screen instead
 * of the bottom.
 */
export function FabNewChat({ onClick, className }: FabNewChatProps) {
  const { t } = useTranslation()
  if (typeof document === 'undefined') return null
  return createPortal(
    <button
      type="button"
      onClick={onClick}
      aria-label={t("menu.newChat")}
      className={cn(
        "fixed right-4 z-30 size-14 rounded-full",
        // The one primary treatment (spec D5): solid accent with its solved label color, floating elevation
        "state-overlay motion-press bg-accent-solid text-on-accent shadow-elev-2",
        "flex items-center justify-center",
        "bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)]",
        className,
      )}
    >
      <Plus className="size-6" strokeWidth={2.5} />
    </button>,
    document.body,
  )
}
