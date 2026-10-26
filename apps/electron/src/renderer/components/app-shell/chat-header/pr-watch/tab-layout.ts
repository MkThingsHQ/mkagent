/** Number of whole, ordered chips that fit, reserving a counter when any are hidden. */
export function fitPrTabCount(widths: readonly number[], available: number, counterWidth: number, gap = 4): number {
  const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap
  if (total <= available) return widths.length
  let used = 0
  let count = 0
  for (const width of widths) {
    const next = used + (count ? gap : 0) + width
    if (next + gap + counterWidth > available) break
    used = next
    count++
  }
  return count
}

/** Keep the active PR visible when other tabs overflow. */
export function visiblePrTabIndexes(total: number, fitCount: number, pinned?: number): number[] {
  const count = Math.max(0, Math.min(total, fitCount))
  const shown = Array.from({ length: count }, (_, index) => index)
  if (pinned === undefined || pinned < count || pinned >= total) return shown
  return count === 0 ? [pinned] : [...shown.slice(0, count - 1), pinned]
}
