/**
 * Background of the generated workspace avatar (the initial on a colored tile). Each workspace keeps
 * its hue; the lightness is the lightest (≤ 52%, the old fixed value) at which the white initial still
 * reaches 4.5:1 — the initial is 10–11px text, so it needs WCAG AA for small text. At 52% many hues
 * (greens, yellows, oranges) gave ~3:1.
 */

const SATURATION = 0.45
const MAX_LIGHTNESS = 52
const MIN_LIGHTNESS = 20
const AA_SMALL_TEXT = 4.5

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Contrast of white text on hsl(hue, 45%, lightness%). */
export function whiteContrastOn(hue: number, lightness: number): number {
  return 1.05 / (relativeLuminance(hslToRgb(hue, SATURATION, lightness / 100)) + 0.05)
}

/** Lightness (in %) of the generated tile for `hue`: as light as possible while white text stays AA. */
export function workspaceAvatarLightness(hue: number): number {
  for (let lightness = MAX_LIGHTNESS; lightness > MIN_LIGHTNESS; lightness--) {
    if (whiteContrastOn(hue, lightness) >= AA_SMALL_TEXT) return lightness
  }
  return MIN_LIGHTNESS
}

export function workspaceAvatarBackground(hue: number): string {
  return `hsl(${hue}, ${SATURATION * 100}%, ${workspaceAvatarLightness(hue)}%)`
}
