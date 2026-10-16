/**
 * Theme roles — contrast-solved color roles derived from the 6-color theme contract.
 *
 * Every text-bearing role (text tiers, status/accent text, focus ring, control border, solid fills and
 * their labels) is SOLVED against the worst surface it can sit on, so bundled presets, user themes and
 * `~/.mkagent/theme.json` overrides all keep WCAG AA without per-theme tuning.
 *
 * Pure module: no DOM, no Node APIs — usable in main, renderer, server and tests.
 *
 * Reference implementation: the design-system engine (`mockups/src/engine.js`, design-spec §2). The default
 * theme's output is checked into `packages/ui/src/styles/tokens.css` as static CSS (no first-paint flash);
 * `__tests__/theme-roles.test.ts` asserts the file still equals solver output.
 */

// ───────────────────────── color math ─────────────────────────

/** A color in OKLab plus straight alpha. */
export interface OklabColor {
  L: number
  a: number
  b: number
  alpha: number
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** OKLab → linear sRGB (unclamped; used for gamut checks). */
function oklabToLinearRgb(c: Pick<OklabColor, 'L' | 'a' | 'b'>): [number, number, number] {
  const l = Math.pow(c.L + 0.3963377774 * c.a + 0.2158037573 * c.b, 3)
  const m = Math.pow(c.L - 0.1055613458 * c.a - 0.0638541728 * c.b, 3)
  const s = Math.pow(c.L - 0.0894841775 * c.a - 1.291485548 * c.b, 3)
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** OKLab → gamma-encoded sRGB, clamped to [0, 1]. */
function rgbOf(c: OklabColor): [number, number, number] {
  const [r, g, b] = oklabToLinearRgb(c)
  return [clamp01(toGamma(r)), clamp01(toGamma(g)), clamp01(toGamma(b))]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  s = clamp01(s)
  l = clamp01(l)
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

function fromRgb(r: number, g: number, b: number, alpha = 1): OklabColor {
  const [L, a, bb] = rgbToOklab(r, g, b)
  return { L, a, b: bb, alpha }
}

/** CSS named colors (CSS Color 4). Theme files are user-editable, so any valid CSS name must parse. */
const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4', azure: '#f0ffff',
  beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000', blanchedalmond: '#ffebcd', blue: '#0000ff',
  blueviolet: '#8a2be2', brown: '#a52a2a', burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00',
  chocolate: '#d2691e', coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b', darkgray: '#a9a9a9',
  darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b', darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000',
  darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b', darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3', deeppink: '#ff1493',
  deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1e90ff', firebrick: '#b22222',
  floralwhite: '#fffaf0', forestgreen: '#228b22', fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff',
  gold: '#ffd700', goldenrod: '#daa520', gray: '#808080', green: '#008000', greenyellow: '#adff2f',
  grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c', indigo: '#4b0082',
  ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa', lavenderblush: '#fff0f5', lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd', lightblue: '#add8e6', lightcoral: '#f08080', lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3', lightgreen: '#90ee90', lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1', lightsalmon: '#ffa07a', lightseagreen: '#20b2aa', lightskyblue: '#87cefa',
  lightslategray: '#778899', lightslategrey: '#778899', lightsteelblue: '#b0c4de', lightyellow: '#ffffe0',
  lime: '#00ff00', limegreen: '#32cd32', linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000',
  mediumaquamarine: '#66cdaa', mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db',
  mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc', mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa',
  mistyrose: '#ffe4e1', moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6',
  olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500', orangered: '#ff4500', orchid: '#da70d6',
  palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee', palevioletred: '#db7093',
  papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd',
  powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399', red: '#ff0000', rosybrown: '#bc8f8f',
  royalblue: '#4169e1', saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57',
  seashell: '#fff5ee', sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd',
  slategray: '#708090', slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f', steelblue: '#4682b4',
  tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347', transparent: '#00000000',
  turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3', white: '#ffffff', whitesmoke: '#f5f5f5',
  yellow: '#ffff00', yellowgreen: '#9acd32',
}

/**
 * Parse a CSS color into OKLab. Supports hex (3/4/6/8 digits), rgb[a](), hsl[a](), oklch(), oklab(),
 * color(srgb …) and CSS named colors. Throws on anything else (e.g. `var()`, `lab()`, `color(display-p3 …)`).
 */
export function parseColor(input: string | OklabColor): OklabColor {
  if (typeof input === 'object') return input
  let s = String(input).trim().toLowerCase()
  if (NAMED_COLORS[s]) s = NAMED_COLORS[s]!
  const num = (t: string, pctScale = 1) => (t.endsWith('%') ? (parseFloat(t) / 100) * pctScale : parseFloat(t))
  const finite = (c: OklabColor): OklabColor => {
    if (![c.L, c.a, c.b, c.alpha].every(Number.isFinite)) throw new Error(`Unparseable color: ${input}`)
    return c
  }

  if (s[0] === '#') {
    let h = s.slice(1)
    if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(h)) throw new Error(`Unparseable color: ${input}`)
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
    const v = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255
    return fromRgb(v(0), v(2), v(4), h.length === 8 ? v(6) : 1)
  }

  const m = s.match(/^([a-z]+)\((.*)\)$/)
  if (!m) throw new Error(`Unparseable color: ${input}`)
  const fn = m[1]!
  let body = m[2]!.replace(/,/g, ' ').replace(/\s*\/\s*/, ' / ').trim()
  let alpha = 1
  if (body.includes(' / ')) {
    const [c, al] = body.split(' / ')
    body = c!
    alpha = num(al!.trim())
  }
  const p = body.split(/\s+/)

  if (fn === 'rgb' || fn === 'rgba') {
    if (p.length === 4) alpha = num(p[3]!)
    const ch = (t: string) => (t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t) / 255)
    return finite(fromRgb(ch(p[0]!), ch(p[1]!), ch(p[2]!), alpha))
  }
  if (fn === 'hsl' || fn === 'hsla') {
    if (p.length === 4) alpha = num(p[3]!)
    const [r, g, b] = hslToRgb(parseFloat(p[0]!), num(p[1]!), num(p[2]!))
    return finite(fromRgb(r, g, b, alpha))
  }
  if (fn === 'oklch') {
    const L = num(p[0]!), C = num(p[1]!, 0.4), H = (parseFloat(p[2]!) * Math.PI) / 180
    return finite({ L, a: C * Math.cos(H), b: C * Math.sin(H), alpha })
  }
  if (fn === 'oklab') return finite({ L: num(p[0]!), a: num(p[1]!, 0.4), b: num(p[2]!, 0.4), alpha })
  if (fn === 'color' && p[0] === 'srgb') return finite(fromRgb(num(p[1]!), num(p[2]!), num(p[3]!), alpha))
  throw new Error(`Unsupported color function: ${input}`)
}

/** True when `parseColor` accepts the value. */
export function isParseableColor(input: string): boolean {
  try {
    parseColor(input)
    return true
  } catch {
    return false
  }
}

function inGamut(c: OklabColor): boolean {
  return oklabToLinearRgb(c).every((v) => v >= -1e-4 && v <= 1 + 1e-4)
}

/** Bring a color into sRGB by lowering chroma at constant lightness and hue (no hue shift from clipping). */
function gamutMap(c: OklabColor): OklabColor {
  if (inGamut(c)) return c
  let lo = 0, hi = 1
  for (let i = 0; i < 20; i++) {
    const k = (lo + hi) / 2
    if (inGamut({ ...c, a: c.a * k, b: c.b * k })) lo = k
    else hi = k
  }
  return { ...c, a: c.a * lo, b: c.b * lo }
}

/** `color-mix(in oklab, x p, y)` for opaque inputs (p = share of x, 0..1). */
export function mixOklab(x: OklabColor, y: OklabColor, p: number): OklabColor {
  return { L: x.L * p + y.L * (1 - p), a: x.a * p + y.a * (1 - p), b: x.b * p + y.b * (1 - p), alpha: 1 }
}

/** Browser alpha compositing (gamma-encoded sRGB): `top` at `alpha` over opaque `bottom`. */
export function over(top: OklabColor, alpha: number, bottom: OklabColor): OklabColor {
  const t = rgbOf(top), u = rgbOf(bottom)
  return fromRgb(t[0] * alpha + u[0] * (1 - alpha), t[1] * alpha + u[1] * (1 - alpha), t[2] * alpha + u[2] * (1 - alpha))
}

/** Flatten a translucent theme color (e.g. scenic `rgba(0,0,0,.4)`) onto an opaque backdrop. */
function flatten(c: OklabColor, backdrop: OklabColor): OklabColor {
  return c.alpha >= 0.999 ? { ...c, alpha: 1 } : over({ ...c, alpha: 1 }, c.alpha, backdrop)
}

/** WCAG 2.x relative luminance. */
export function luminance(c: OklabColor): number {
  const [r, g, b] = rgbOf(c).map(toLinear) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio (1–21). */
export function contrastRatio(x: OklabColor, y: OklabColor): number {
  const l1 = luminance(x), l2 = luminance(y)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

const minContrast = (c: OklabColor, surfaces: OklabColor[]) => Math.min(...surfaces.map((s) => contrastRatio(c, s)))

/** Solved colors are emitted as 8-bit hex; aim slightly above each target so rounding can't drop below it. */
const MARGIN = 0.04

/** 8-bit sRGB hex (alpha dropped — every solved role is opaque). */
export function toHex(c: OklabColor): string {
  return '#' + rgbOf(c).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
}

/** OKLCH hue in degrees (0–360). */
export function hueOf(c: OklabColor): number {
  const h = (Math.atan2(c.b, c.a) * 180) / Math.PI
  return h < 0 ? h + 360 : h
}

/** OKLCH chroma. */
export function chromaOf(c: OklabColor): number {
  return Math.hypot(c.a, c.b)
}

const withL = (c: OklabColor, L: number): OklabColor => ({ ...c, L })

/**
 * Smallest share p of `ink` mixed into `base` (oklab) so the result reaches `target` contrast on every surface.
 * Monotone in p, so bisection is exact to ~0.1%. If even pure ink can't reach the target, returns ink (p = 1):
 * we never make a tier *less* legible than the theme's own foreground.
 */
function solveMix(ink: OklabColor, base: OklabColor, surfaces: OklabColor[], target: number) {
  if (minContrast(ink, surfaces) < target) return { color: ink, p: 1, reached: false }
  let lo = 0, hi = 1
  const goal = Math.min(target + MARGIN, minContrast(ink, surfaces))
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (minContrast(mixOklab(ink, base, mid), surfaces) >= goal) hi = mid
    else lo = mid
  }
  return { color: mixOklab(ink, base, hi), p: hi, reached: true }
}

/** Move a color's OKLab lightness away from the surfaces — hue kept, chroma reduced only where sRGB requires it. */
function solveLightness(c: OklabColor, surfaces: OklabColor[], target: number, darker: boolean): OklabColor {
  if (minContrast(c, surfaces) >= target) return c
  target += MARGIN
  const at = (L: number) => gamutMap(withL(c, L))
  let lo = darker ? 0 : c.L, hi = darker ? c.L : 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const ok = minContrast(at(mid), surfaces) >= target
    if (darker) {
      if (ok) lo = mid
      else hi = mid
    } else {
      if (ok) hi = mid
      else lo = mid
    }
  }
  return at(darker ? lo : hi)
}

/**
 * Solid fill + label pair for buttons/badges. White labels are preferred (the conventional look in both modes):
 * the fill darkens just enough to carry white at AA. Inherently light hues (amber, lime, pastel accents) would turn
 * muddy, so when the fill would have to drop more than MAX_SOLID_SHIFT in OKLab L, the label becomes `ink`
 * instead and the fill lightens if needed.
 */
const MAX_SOLID_SHIFT = 0.2
function solveSolid(fill: OklabColor, white: OklabColor, ink: OklabColor, target = 4.5) {
  const whiteFill = solveLightness(fill, [white], target, true)
  if (fill.L - whiteFill.L <= MAX_SOLID_SHIFT) return { solid: whiteFill, on: white }
  return { solid: solveLightness(fill, [ink], target, false), on: ink }
}

/**
 * Text-safe version of a hue: keep it if it already passes; else walk its lightness away from the surfaces
 * (hue kept); if that can't reach the target (low-contrast themes on tinted containers), mix toward the text
 * color, then toward pure black/white.
 */
function solveTextColor(c: OklabColor, text: OklabColor, surfaces: OklabColor[], target: number = CONTRAST_TARGETS.statusText): OklabColor {
  if (minContrast(c, surfaces) >= target) return c
  const light = luminance(surfaces[0]!) > 0.18
  const viaL = solveLightness(c, surfaces, target, light)
  if (minContrast(viaL, surfaces) >= target) return viaL
  const viaText = solveMix(text, c, surfaces, target)
  if (viaText.reached) return viaText.color
  const extreme: OklabColor = light ? { L: 0, a: 0, b: 0, alpha: 1 } : { L: 1, a: 0, b: 0, alpha: 1 }
  return solveMix(extreme, c, surfaces, target).color
}

// ───────────────────────── role tables ─────────────────────────

export type ThemeRoleMode = 'light' | 'dark'

/**
 * Share of foreground mixed into background (oklab) for each opaque surface. Light: content is the brightest
 * thing and chrome recedes one step; dark: lighter = nearer (navigator is the base, paper and floats step up).
 */
export const SURFACE_MIX = {
  light: { navigator: 0.04, paper: 0, raised: 0, sunken: 0.03, floating: 0, scrimAlpha: 0.22 },
  dark: { navigator: 0, paper: 0.045, raised: 0.075, sunken: 0.02, floating: 0.1, scrimAlpha: 0.55 },
} as const

/** Translucent foreground over any surface (sRGB alpha) — states and hairlines work on every material. */
export const ALPHA_ROLES = {
  light: { hover: 0.045, pressed: 0.075, selected: 0.07, bubble: 0.055, borderSubtle: 0.07, border: 0.1, borderStrong: 0.16, tint: 0.1, tintStrong: 0.2, diff: 0.12, diffWord: 0.26 },
  dark: { hover: 0.06, pressed: 0.1, selected: 0.09, bubble: 0.07, borderSubtle: 0.07, border: 0.1, borderStrong: 0.16, tint: 0.14, tintStrong: 0.26, diff: 0.15, diffWord: 0.3 },
} as const

/**
 * Contrast targets (WCAG 2.2). Text targets are met on the WORST surface the role can sit on (incl.
 * hover/selected fills), so every placement passes — not just the panel background.
 */
export const CONTRAST_TARGETS = {
  text: 4.5,
  secondary: 7.0,
  tertiary: 4.6,
  disabled: 2.4,
  control: 3.0,
  focus: 3.0,
  statusText: 4.5,
  accentText: 4.5,
  onSolid: 4.5,
} as const

/** The 6-color contract plus the optional surface overrides a theme may set. Any CSS color string. */
export interface ThemeRoleInput {
  background: string
  foreground: string
  accent: string
  info: string
  success: string
  destructive: string
  paper?: string
  navigator?: string
  popover?: string
  popoverSolid?: string
}

export type StatusRole = 'info' | 'success' | 'destructive'

export interface ThemeRolesReport {
  mode: ThemeRoleMode
  text: number
  textOnPaper: number
  secondary: number
  tertiary: number
  control: number
  onAccent: number
  accentText: number
  focus: number
  baseContrast: number
  textNudged: boolean
  accentSolidShifted: boolean
  status: Record<StatusRole, { text: number; onSolid: number; textOnTint: number; shifted: boolean }>
  diff: { textOnAddWord: number; textOnDelWord: number }
  surfaces: { navigator: string; paper: string; raised: string; floating: string; sunken: string }
}

export interface ThemeRoles {
  /** CSS custom properties (name → value), ready to inject into `:root`. */
  vars: Record<string, string>
  /** Achieved contrast per role, measured on the 8-bit (emitted) values. */
  report: ThemeRolesReport
}

/** The custom properties `deriveThemeRoles` emits, in emission order. */
export const DERIVED_ROLE_VARS = [
  '--surface-navigator', '--surface-paper', '--surface-raised', '--surface-sunken', '--surface-floating',
  '--scrim', '--fg-base', '--text', '--text-secondary', '--text-tertiary', '--text-disabled', '--border-control',
  '--accent-solid', '--on-accent', '--accent-text', '--focus-ring', '--accent-raw',
  '--info-raw', '--info-text', '--info-solid', '--on-info',
  '--success-raw', '--success-text', '--success-solid', '--on-success',
  '--destructive-raw', '--destructive-text', '--destructive-solid', '--on-destructive',
  '--diff-text',
] as const

/**
 * Derive every color role for one mode from a theme's base colors (+ optional surface overrides).
 * Throws if a color can't be parsed — callers handling user input should validate with `isParseableColor`.
 */
export function deriveThemeRoles(theme: ThemeRoleInput, mode: ThemeRoleMode): ThemeRoles {
  const dark = mode === 'dark'
  const S = SURFACE_MIX[mode], A = ALPHA_ROLES[mode]
  const WHITE = parseColor('#ffffff'), BLACK = parseColor('#000000')

  // Scenic (translucent) backgrounds sit over an unknown image: assume a mid backdrop, or the theme's solid popover.
  const scenicBackdrop = dark ? parseColor('#18181b') : parseColor('#f4f4f5')
  const bg0 = parseColor(theme.background)
  const B = flatten(bg0, theme.popoverSolid ? flatten(parseColor(theme.popoverSolid), scenicBackdrop) : scenicBackdrop)
  const F0 = flatten(parseColor(theme.foreground), B)

  const surf = (k: 'navigator' | 'paper' | 'raised' | 'sunken' | 'floating') => (S[k] === 0 ? B : mixOklab(F0, B, S[k]))
  const navigator = theme.navigator ? flatten(parseColor(theme.navigator), B) : surf('navigator')
  const paper = theme.paper ? flatten(parseColor(theme.paper), B) : surf('paper')
  const raised = dark ? surf('raised') : paper
  const sunken = surf('sunken')
  const floating = theme.popoverSolid
    ? flatten(parseColor(theme.popoverSolid), B)
    : theme.popover
      ? flatten(parseColor(theme.popover), B)
      : surf('floating')

  // Every place text can sit: the surfaces themselves + hover/selected fills on each surface.
  const bases = [navigator, paper, raised, sunken, floating]
  const textSurfaces = [
    ...bases,
    ...bases.map((s) => over(F0, A.selected, s)),
    ...bases.map((s) => over(F0, A.hover, s)),
    // a neutral chip (hover-strength fill) inside a selected list/sidebar row — the only place fills stack
    ...[navigator, paper].map((s) => over(F0, A.hover, over(F0, A.selected, s))),
    over(F0, A.bubble, paper),
  ]

  // Primary text: the theme foreground, nudged toward black/white only if the theme itself misses AA.
  const extreme = dark ? WHITE : BLACK
  const text = minContrast(F0, textSurfaces) >= CONTRAST_TARGETS.text ? F0 : solveMix(extreme, F0, textSurfaces, CONTRAST_TARGETS.text).color
  const secondary = solveMix(text, B, textSurfaces, CONTRAST_TARGETS.secondary).color
  const tertiary = solveMix(text, B, textSurfaces, CONTRAST_TARGETS.tertiary).color
  const disabled = solveMix(text, B, [paper], CONTRAST_TARGETS.disabled).color
  const control = solveMix(text, B, [paper, raised, floating, navigator], CONTRAST_TARGETS.control).color // switch-off track, checkbox

  const ink = dark ? B : text // dark label for light fills

  // Accent family
  const acc = flatten(parseColor(theme.accent), B)
  const accSolid = solveSolid(acc, WHITE, ink)
  // Fill states a chip/label can sit on: plain surfaces + hover/selected rows.
  const stateBases = [...bases, ...bases.map((s) => over(F0, A.selected, s)), ...bases.map((s) => over(F0, A.hover, s))]
  const accText = solveTextColor(acc, text, [...textSurfaces, ...stateBases.map((s) => over(acc, A.tint, s))])
  const focus = solveTextColor(acc, text, [navigator, paper, raised, floating, sunken], CONTRAST_TARGETS.focus)

  const vars: Record<string, string> = {
    '--surface-navigator': toHex(navigator),
    '--surface-paper': toHex(paper),
    '--surface-raised': toHex(raised),
    '--surface-sunken': toHex(sunken),
    '--surface-floating': toHex(floating),
    '--scrim': dark ? `rgb(0 0 0 / ${S.scrimAlpha})` : `color-mix(in oklab, ${toHex(F0)} ${S.scrimAlpha * 100}%, transparent)`,
    '--fg-base': toHex(F0),
    '--text': toHex(text),
    '--text-secondary': toHex(secondary),
    '--text-tertiary': toHex(tertiary),
    '--text-disabled': toHex(disabled),
    '--border-control': toHex(control),
    '--accent-solid': toHex(accSolid.solid),
    '--on-accent': toHex(accSolid.on),
    '--accent-text': toHex(accText),
    '--focus-ring': toHex(focus),
    '--accent-raw': toHex(acc),
  }
  const q = (c: OklabColor) => parseColor(toHex(c))
  const report: ThemeRolesReport = {
    mode,
    text: minContrast(q(text), textSurfaces),
    textOnPaper: contrastRatio(q(text), paper),
    secondary: minContrast(q(secondary), textSurfaces),
    tertiary: minContrast(q(tertiary), textSurfaces),
    control: minContrast(q(control), [paper, raised, floating, navigator]),
    onAccent: contrastRatio(q(accSolid.on), q(accSolid.solid)),
    accentText: minContrast(q(accText), textSurfaces),
    focus: minContrast(q(focus), [navigator, paper, raised, floating, sunken]),
    baseContrast: contrastRatio(F0, B),
    textNudged: text !== F0,
    accentSolidShifted: Math.abs(accSolid.solid.L - acc.L) > 0.005,
    status: {} as ThemeRolesReport['status'],
    diff: { textOnAddWord: 0, textOnDelWord: 0 },
    surfaces: { navigator: toHex(navigator), paper: toHex(paper), raised: toHex(raised), floating: toHex(floating), sunken: toHex(sunken) },
  }

  for (const k of ['info', 'success', 'destructive'] as const) {
    const c = flatten(parseColor(theme[k]), B)
    const tintOn = (s: OklabColor) => over(c, A.tint, s)
    // Status text must hold on plain surfaces, on its own tinted chip (also inside hovered/selected rows), and —
    // for success/destructive — on diff rows (code blocks sit on the sunken surface).
    const statusSurfaces = [...textSurfaces, ...stateBases.map(tintOn), over(c, A.diff, sunken), over(c, A.diff, raised)]
    const fg = solveTextColor(c, text, statusSurfaces)
    const solid = solveSolid(c, WHITE, ink)
    vars[`--${k}-raw`] = toHex(c)
    vars[`--${k}-text`] = toHex(fg)
    vars[`--${k}-solid`] = toHex(solid.solid)
    vars[`--on-${k}`] = toHex(solid.on)
    report.status[k] = {
      text: minContrast(q(fg), statusSurfaces),
      onSolid: contrastRatio(q(solid.on), q(solid.solid)),
      textOnTint: minContrast(text, [tintOn(paper), tintOn(raised)]),
      shifted: toHex(fg) !== toHex(c),
    }
  }

  // Diff rows: tinted backgrounds from success/destructive. Code text gets its own solved role so the word
  // highlights stay visible on low-contrast themes (the text darkens/lightens instead of the tint fading out).
  const add = flatten(parseColor(theme.success), B), del = flatten(parseColor(theme.destructive), B)
  const diffSurfaces = [sunken, raised].flatMap((s) => [s, over(add, A.diff, s), over(del, A.diff, s), over(add, A.diffWord, s), over(del, A.diffWord, s)])
  const diffText = solveTextColor(text, text, diffSurfaces, CONTRAST_TARGETS.text)
  vars['--diff-text'] = toHex(diffText)
  report.diff = {
    textOnAddWord: Math.min(contrastRatio(q(diffText), over(add, A.diffWord, raised)), contrastRatio(q(diffText), over(add, A.diffWord, sunken))),
    textOnDelWord: Math.min(contrastRatio(q(diffText), over(del, A.diffWord, raised)), contrastRatio(q(diffText), over(del, A.diffWord, sunken))),
  }
  return { vars, report }
}

/**
 * Static alpha tokens that reference the live base colors (work for any theme without JS). These are written
 * into `tokens.css` per mode; exported so the test can keep the stylesheet and the tables in sync.
 */
export function alphaRoleVars(mode: ThemeRoleMode): Record<string, string> {
  const A = ALPHA_ROLES[mode]
  const pct = (x: number) => `${+(x * 100).toFixed(1)}%`
  const fg = (x: number) => `color-mix(in srgb, var(--fg-base) ${pct(x)}, transparent)`
  const tint = (role: string, x: number) => `color-mix(in srgb, var(--${role}-raw) ${pct(x)}, transparent)`
  return {
    '--fill-hover': fg(A.hover),
    '--fill-pressed': fg(A.pressed),
    '--fill-selected': fg(A.selected),
    '--fill-bubble': fg(A.bubble),
    '--border-subtle': fg(A.borderSubtle),
    '--border': fg(A.border),
    '--border-strong': fg(A.borderStrong),
    '--accent-tint': tint('accent', A.tint),
    '--accent-tint-strong': tint('accent', A.tintStrong),
    '--info-tint': tint('info', A.tint),
    '--success-tint': tint('success', A.tint),
    '--destructive-tint': tint('destructive', A.tint),
    '--info-border': tint('info', 0.32),
    '--success-border': tint('success', 0.32),
    '--destructive-border': tint('destructive', 0.32),
    '--diff-add': tint('success', A.diff),
    '--diff-add-word': tint('success', A.diffWord),
    '--diff-del': tint('destructive', A.diff),
    '--diff-del-word': tint('destructive', A.diffWord),
    '--selection': tint('accent', mode === 'dark' ? 0.4 : 0.24),
  }
}

/** Light or dark, judged by the background's own luminance (flattened over a neutral backdrop if translucent). */
export function backgroundIsDark(background: string): boolean {
  const c = parseColor(background)
  const flat = c.alpha >= 0.999 ? c : over({ ...c, alpha: 1 }, c.alpha, parseColor('#808080'))
  return luminance(flat) < 0.18
}
