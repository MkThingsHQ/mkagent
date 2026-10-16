import { actions, type ActionId } from '@/actions/definitions'
import { isMac } from '@/lib/platform'

/** Platform glyph/word for one hotkey part, matching the action registry's display format. */
function keyLabel(part: string): string {
  switch (part) {
    case 'mod': return isMac ? '⌘' : 'Ctrl'
    case 'shift': return isMac ? '⇧' : 'Shift'
    case 'alt': return isMac ? '⌥' : 'Alt'
    case 'escape': return 'Esc'
    case 'tab': return 'Tab'
    case 'enter': return '↵'
    default: return part.toUpperCase()
  }
}

/**
 * Keycaps for an action's binding from the action definitions — the source of truth the registry
 * reads (it has no user overrides yet). Used where the composer renders outside
 * `ActionRegistryProvider` too (playground), where `useActionLabel` would throw.
 */
export function actionHotkeyKeys(actionId: ActionId): string[] {
  const hotkey = actions[actionId].defaultHotkey
  return hotkey ? hotkey.toLowerCase().split('+').map(keyLabel) : []
}

/** Keycaps for the composer's own send / new-line keys (FreeFormInput handles them locally). */
export function composerSendKeys(sendMessageKey: 'enter' | 'cmd-enter'): { send: string[]; newLine: string[] } {
  return sendMessageKey === 'enter'
    ? { send: [keyLabel('enter')], newLine: [keyLabel('shift'), keyLabel('enter')] }
    : { send: [keyLabel('mod'), keyLabel('enter')], newLine: [keyLabel('enter')] }
}
