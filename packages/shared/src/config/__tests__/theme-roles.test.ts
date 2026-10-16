/**
 * Guardrails for the contrast-solved theme roles (design spec §2, implementation plan A0/A2):
 * - every bundled preset × mode meets WCAG AA for every role, AND keeps the meaning of its
 *   status/accent colors (an earlier solver passed AA while turning every status gray);
 * - the static default-theme values in packages/ui/src/styles/tokens.css equal solver output.
 */
import { describe, expect, it } from 'bun:test'
import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import {
  ALPHA_ROLES,
  DERIVED_ROLE_VARS,
  alphaRoleVars,
  backgroundIsDark,
  chromaOf,
  deriveThemeRoles,
  hueOf,
  parseColor,
  type ThemeRoleMode,
} from '../theme-roles.ts'
import {
  BACKGROUND_HEX,
  DEFAULT_THEME,
  resolveTheme,
  resolveThemeRoleInput,
  themeToCSS,
  type ThemeFile,
} from '../theme.ts'
import { validateThemeContent } from '../validators.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const THEMES_DIR = join(REPO_ROOT, 'apps/electron/resources/themes')
const TOKENS_CSS = join(REPO_ROOT, 'packages/ui/src/styles/tokens.css')

const AA = 4.5
const NON_TEXT = 3

function loadPresets(): { id: string; theme: ThemeFile }[] {
  return readdirSync(THEMES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({ id: file.replace(/\.json$/, ''), theme: JSON.parse(readFileSync(join(THEMES_DIR, file), 'utf-8')) as ThemeFile }))
}

function presetModes(theme: ThemeFile): ThemeRoleMode[] {
  return theme.supportedModes?.length ? theme.supportedModes : ['light', 'dark']
}

/** Custom properties declared in the first block that starts with `selector {` at column 0. */
function cssBlockVars(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {\n`)
  if (start < 0) throw new Error(`block ${selector} not found in tokens.css`)
  const body = css.slice(start, css.indexOf('\n}', start))
  const vars: Record<string, string> = {}
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[match[1]!] = match[2]!.trim()
  return vars
}

describe('theme roles: bundled presets', () => {
  const presets = loadPresets()

  it('ships the new built-ins', () => {
    const ids = presets.map((p) => p.id)
    expect(ids).toContain('default')
    expect(ids).toContain('craft')
    expect(ids).toContain('paper')
  })

  for (const { id, theme } of presets) {
    for (const mode of presetModes(theme)) {
      it(`${id}/${mode} meets AA for every role and keeps status hues`, () => {
        const input = resolveThemeRoleInput(theme, mode === 'dark')
        const { vars, report } = deriveThemeRoles(input, mode)
        const failures: string[] = []
        const checks: [string, number, number][] = [
          ['text', report.text, AA],
          ['secondary', report.secondary, AA],
          ['tertiary', report.tertiary, AA],
          ['control', report.control, NON_TEXT],
          ['onAccent', report.onAccent, AA],
          ['accentText', report.accentText, AA],
          ['focus', report.focus, NON_TEXT],
          ['diffAdd', report.diff.textOnAddWord, AA],
          ['diffDel', report.diff.textOnDelWord, AA],
        ]
        for (const k of ['info', 'success', 'destructive'] as const) {
          checks.push([`${k}Text`, report.status[k].text, AA], [`on${k}`, report.status[k].onSolid, AA])
        }
        for (const [role, value, target] of checks) {
          if (value + 1e-6 < target) failures.push(`${role} ${value.toFixed(2)} < ${target}`)
        }

        // Meaning: hue drifts ≤ 12°, and a chromatic color stays visibly chromatic.
        for (const k of ['info', 'success', 'destructive', 'accent'] as const) {
          const raw = parseColor(input[k])
          const solved = parseColor(vars[k === 'accent' ? '--accent-text' : `--${k}-text`]!)
          if (chromaOf(raw) < 0.04) continue
          let drift = Math.abs(hueOf(raw) - hueOf(solved))
          if (drift > 180) drift = 360 - drift
          if (drift > 12) failures.push(`${k} hue drifted ${drift.toFixed(0)}°`)
          if (chromaOf(solved) < Math.min(0.04, 0.6 * chromaOf(raw))) failures.push(`${k} lost its color`)
        }
        expect(failures).toEqual([])
      })
    }
  }
})

describe('theme roles: static default theme in tokens.css', () => {
  const css = readFileSync(TOKENS_CSS, 'utf-8')
  const blocks: Record<ThemeRoleMode, Record<string, string>> = {
    light: cssBlockVars(css, ':root'),
    dark: cssBlockVars(css, '.dark'),
  }

  for (const mode of ['light', 'dark'] as const) {
    it(`${mode}: theme input matches DEFAULT_THEME`, () => {
      const input = resolveThemeRoleInput(DEFAULT_THEME, mode === 'dark')
      for (const key of ['background', 'foreground', 'accent', 'info', 'success', 'destructive'] as const) {
        expect(`--${key}: ${blocks[mode][`--${key}`]}`).toBe(`--${key}: ${input[key]}`)
      }
    })

    it(`${mode}: derived roles equal solver output`, () => {
      const { vars } = deriveThemeRoles(resolveThemeRoleInput(DEFAULT_THEME, mode === 'dark'), mode)
      const mismatches = DERIVED_ROLE_VARS.filter((name) => blocks[mode][name] !== vars[name]).map(
        (name) => `${name}: tokens.css has ${blocks[mode][name]}, solver says ${vars[name]}`,
      )
      expect(mismatches).toEqual([])
    })

    it(`${mode}: alpha roles equal the ALPHA_ROLES table`, () => {
      const expected = alphaRoleVars(mode)
      const mismatches = Object.keys(expected).filter((name) => blocks[mode][name] !== expected[name])
      expect(mismatches).toEqual([])
    })
  }

  it('alpha tables cover both modes', () => {
    expect(Object.keys(ALPHA_ROLES.light)).toEqual(Object.keys(ALPHA_ROLES.dark))
  })

  it('BACKGROUND_HEX is the default navigator surface', () => {
    for (const mode of ['light', 'dark'] as const) {
      const { vars } = deriveThemeRoles(resolveThemeRoleInput(DEFAULT_THEME, mode === 'dark'), mode)
      expect<string>(BACKGROUND_HEX[mode]).toBe(vars['--surface-navigator']!)
    }
  })
})

describe('themeToCSS', () => {
  const declarations = (css: string) =>
    Object.fromEntries(css.split('\n').map((line) => line.trim().replace(/;$/, '').split(/:\s(.+)/).slice(0, 2)))

  it('emits base colors and every solved role, without legacy rgb triplets', () => {
    const vars = declarations(themeToCSS(DEFAULT_THEME, false))
    for (const name of [...DERIVED_ROLE_VARS, '--background', '--accent']) expect(vars[name]).toBeDefined()
    expect(Object.keys(vars).some((name) => name.endsWith('-rgb'))).toBe(false)
    // shadcn's --input is a border color; the theme's `input` surface must never overwrite it
    expect(vars['--input']).toBeUndefined()
  })

  it('layers a partial override (theme.json with only an accent) on the default theme', () => {
    const vars = declarations(themeToCSS({ accent: '#0969da' }, false))
    expect(vars['--accent']).toBe('#0969da')
    expect(vars['--background']).toBe(DEFAULT_THEME.background)
    expect(vars['--surface-navigator']).toBe(BACKGROUND_HEX.light)
  })

  it('falls back to the default color for values it cannot parse', () => {
    const vars = declarations(themeToCSS({ accent: 'var(--brand)', foreground: 'not-a-color' }, false))
    expect(vars['--accent']).toBe(DEFAULT_THEME.accent)
    expect(vars['--foreground']).toBe(DEFAULT_THEME.foreground)
  })

  it('emits the input surface under its own name', () => {
    const vars = declarations(themeToCSS({ input: '#eeeeee' }, false))
    expect(vars['--surface-input']).toBe('#eeeeee')
  })

  it('solves a light-only theme shown in dark mode as light (never white text on a light background)', () => {
    const lightOnly = { background: '#ffffff', foreground: '#222222', accent: '#0969da', info: '#bf8700', success: '#1a7f37', destructive: '#cf222e' }
    expect(backgroundIsDark(lightOnly.background)).toBe(false)
    const text = parseColor(declarations(themeToCSS(lightOnly, true))['--text']!)
    expect(text.L).toBeLessThan(0.5)
  })
})

describe('resolveTheme', () => {
  it('keeps preset metadata and lets later layers override colors (dark deep-merged)', () => {
    const preset: ThemeFile = { name: 'X', shikiTheme: { light: 'a' }, accent: '#111111', dark: { accent: '#222222', info: '#333333' } }
    const merged = resolveTheme(preset, { accent: '#444444', dark: { accent: '#555555' } }) as ThemeFile
    expect(merged.shikiTheme).toEqual({ light: 'a' })
    expect(merged.accent).toBe('#444444')
    expect(merged.dark).toEqual({ accent: '#555555', info: '#333333' })
  })

  it('skips missing layers', () => {
    expect(resolveTheme(null, undefined)).toEqual({})
    expect(resolveTheme(undefined, { accent: '#123456' })).toEqual({ accent: '#123456' })
  })
})

describe('theme file validation', () => {
  it('warns (without failing) about colors the solver cannot parse', () => {
    const result = validateThemeContent(JSON.stringify({ name: 'Bad', accent: 'var(--x)', dark: { info: 'lab(50% 20 30)' } }))
    expect(result.valid).toBe(true)
    expect(result.warnings.map((w) => w.path)).toEqual(['accent', 'dark.info'])
  })
})
