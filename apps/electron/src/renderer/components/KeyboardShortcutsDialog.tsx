import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useRegisterModal } from "@/context/ModalContext"
import { isMac } from "@/lib/platform"
import { actionsByCategory, useActionLabel, type ActionId } from "@/actions"
import { Kbd, KbdGroup } from "@/components/ui/kbd"

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ShortcutItem {
  keys: string[]
  description: string
}

interface ShortcutSection {
  title: string
  shortcuts: ShortcutItem[]
}

// Component-specific shortcuts that aren't in the centralized registry
// These are context-sensitive behaviors, not global actions
function useComponentSpecificSections(): ShortcutSection[] {
  const { t } = useTranslation()
  return [
    {
      title: t('shortcuts.listNavigation'),
      shortcuts: [
        { keys: ['↑', '↓'], description: t('shortcuts.navigateItems') },
        { keys: ['Home'], description: t('shortcuts.goToFirst') },
        { keys: ['End'], description: t('shortcuts.goToLast') },
      ],
    },
    {
      title: t('shortcuts.sessionList'),
      shortcuts: [
        { keys: ['Enter'], description: t('shortcuts.focusChatInput') },
        { keys: ['Delete'], description: t('shortcuts.deleteSession') },
        { keys: ['R'], description: t('shortcuts.renameSession') },
        { keys: ['Right-click'], description: t('shortcuts.openContextMenu') },
        { keys: [isMac ? '⌥' : 'Alt', 'Click'], description: t('shortcuts.addFilterExcluded') },
      ],
    },
    {
      title: t('shortcuts.agentTree'),
      shortcuts: [
        { keys: ['←'], description: t('shortcuts.collapseFolder') },
        { keys: ['→'], description: t('shortcuts.expandFolder') },
      ],
    },
    {
      title: t('shortcuts.chatInput'),
      shortcuts: [
        { keys: ['Enter'], description: t('shortcuts.sendMessage') },
        { keys: ['Shift', 'Enter'], description: t('shortcuts.newLine') },
        { keys: ['Esc'], description: t('shortcuts.closeDialogBlur') },
      ],
    },
  ]
}

/**
 * Renders a shortcut row for an action from the registry
 */
function ActionShortcutRow({ actionId }: { actionId: ActionId }) {
  const { label, hotkey } = useActionLabel(actionId)

  if (!hotkey) return null

  // Split hotkey into individual keys for display
  // Mac: symbols are concatenated (⌘⇧N) - need smart splitting
  // Windows: separated by + (Ctrl+Shift+N) - split on +
  const keys = isMac
    ? hotkey.match(/[⌘⇧⌥←→]|Tab|Esc|./g) || []
    : hotkey.split('+')

  return (
    <div className="flex min-h-row-menu items-center justify-between gap-3">
      <span className="text-label">{label}</span>
      <KbdGroup>
        {keys.map((key, keyIndex) => (
          <Kbd key={keyIndex}>{key}</Kbd>
        ))}
      </KbdGroup>
    </div>
  )
}

/**
 * Renders a section of shortcuts from the registry
 */
function RegistrySection({ category, actionIds }: { category: string; actionIds: ActionId[] }) {
  return (
    <div>
      <h3 className="text-label-sm font-medium text-tertiary mb-1">
        {category}
      </h3>
      <div>
        {actionIds.map(actionId => (
          <ActionShortcutRow key={actionId} actionId={actionId} />
        ))}
      </div>
    </div>
  )
}

/**
 * Renders a section of static shortcuts (component-specific)
 */
function StaticSection({ section }: { section: ShortcutSection }) {
  return (
    <div>
      <h3 className="text-label-sm font-medium text-tertiary mb-1">
        {section.title}
      </h3>
      <div>
        {section.shortcuts.map((shortcut, index) => (
          <div key={index} className="flex min-h-row-menu items-center justify-between gap-3">
            <span className="text-label">{shortcut.description}</span>
            <KbdGroup>
              {shortcut.keys.map((key, keyIndex) => (
                <Kbd key={keyIndex}>{key}</Kbd>
              ))}
            </KbdGroup>
          </div>
        ))}
      </div>
    </div>
  )
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const { t } = useTranslation()
  const componentSpecificSections = useComponentSpecificSections()

  // Register with modal context so X button / Cmd+W closes this dialog first
  useRegisterModal(open, () => onOpenChange(false))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Registry-driven sections */}
          {Object.entries(actionsByCategory).map(([category, actions]) => (
            <RegistrySection
              key={category}
              category={category}
              actionIds={actions.map(a => a.id as ActionId)}
            />
          ))}

          {/* Component-specific sections */}
          {componentSpecificSections.map((section) => (
            <StaticSection key={section.title} section={section} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
