import { cn } from "@/lib/utils"
import { Kbd, KbdGroup } from "./kbd"

const MAC_MODIFIERS = new Set(["⌘", "⇧", "⌥", "⌃"])

/**
 * Split a hotkey display string from the action registry ("⌘N", "⌘⇧[", "Ctrl+N", "Shift+Tab") into keys.
 * macOS strings are joined without separators, so modifier glyphs are peeled off the front.
 */
export function splitHotkeyDisplay(display: string): string[] {
  if (display.includes("+") && display.length > 1) return display.split("+").filter(Boolean)
  const keys: string[] = []
  let rest = display
  while (rest.length > 1 && MAC_MODIFIERS.has(rest[0]!)) {
    keys.push(rest[0]!)
    rest = rest.slice(1)
  }
  if (rest) keys.push(rest)
  return keys
}

/** Keycaps for a registry hotkey display string (`useActionLabel(id).hotkey`). Renders nothing for null. */
export function HotkeyKeycaps({ hotkey, className }: { hotkey: string | null | undefined; className?: string }) {
  if (!hotkey) return null
  return (
    <KbdGroup className={cn("shrink-0", className)}>
      {splitHotkeyDisplay(hotkey).map((key, i) => (
        <Kbd key={`${key}-${i}`}>{key}</Kbd>
      ))}
    </KbdGroup>
  )
}
