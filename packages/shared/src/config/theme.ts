/**
 * Theme Configuration
 *
 * App-level theme system with preset themes.
 * Light mode is default, with optional dark mode overrides.
 *
 * Storage locations:
 * - App override:   ~/.mkagent/theme.json
 * - Preset themes:  ~/.mkagent/themes/*.json
 */

import {
  backgroundIsDark,
  deriveThemeRoles,
  isParseableColor,
  type ThemeRoleInput,
} from './theme-roles.ts';

/**
 * CSS color string - any valid CSS color format:
 * - Hex: #8b5cf6, #8b5cf6cc
 * - RGB: rgb(139, 92, 246), rgba(139, 92, 246, 0.8)
 * - HSL: hsl(262, 83%, 58%)
 * - OKLCH: oklch(0.58 0.22 293) (recommended)
 * - Named: purple, rebeccapurple
 */
export type CSSColor = string;

/**
 * Core theme colors (6-color semantic system)
 */
export interface ThemeColors {
  background?: CSSColor;
  foreground?: CSSColor;
  accent?: CSSColor; // Brand purple (Execute mode)
  info?: CSSColor; // Amber (Ask mode, warnings)
  success?: CSSColor; // Green
  destructive?: CSSColor; // Red
}

/**
 * Surface colors for specific UI regions
 * All optional - fall back to `background` if not set
 */
export interface SurfaceColors {
  paper?: CSSColor; // AI messages, cards, elevated content
  navigator?: CSSColor; // Left sidebar background
  input?: CSSColor; // Input field background (emitted as --surface-input; never shadcn's --input border)
  popover?: CSSColor; // Dropdowns, modals, context menus (always solid, no transparency)
  popoverSolid?: CSSColor; // Guaranteed 100% opaque popover bg (required for scenic mode)
}

/**
 * Theme mode - solid (default) or scenic (background image with glass panels)
 */
export type ThemeMode = 'solid' | 'scenic';

/**
 * Theme overrides - light mode default, optional dark overrides
 * App-level only (no workspace cascading)
 */
export interface ThemeOverrides extends ThemeColors, SurfaceColors {
  // Optional dark mode overrides (includes both semantic and surface colors)
  dark?: ThemeColors & SurfaceColors;

  /**
   * Theme mode: 'solid' (default) or 'scenic'
   * - solid: Traditional solid color backgrounds
   * - scenic: Full-window background image with glass panels
   */
  mode?: ThemeMode;

  /**
   * Background image URL for scenic mode
   * Remote URL to background image (JPEG, PNG, WebP recommended)
   * Required when mode='scenic', ignored otherwise
   */
  backgroundImage?: string;
}

/**
 * Deep merge two theme objects (source wins for defined values)
 */
const COLOR_KEYS: (keyof ThemeColors)[] = [
  'background',
  'foreground',
  'accent',
  'info',
  'success',
  'destructive',
];

const SURFACE_KEYS: (keyof SurfaceColors)[] = [
  'paper',
  'navigator',
  'input',
  'popover',
  'popoverSolid',
];

// Combined keys for merging (all color properties)
const ALL_COLOR_KEYS = [...COLOR_KEYS, ...SURFACE_KEYS] as const;

function mergeThemes(
  base: ThemeOverrides | undefined,
  override: ThemeOverrides | undefined
): ThemeOverrides {
  if (!base) return override || {};
  if (!override) return base;

  const result: ThemeOverrides = { ...base };

  // Merge top-level color properties (semantic + surface)
  for (const key of ALL_COLOR_KEYS) {
    if (override[key] !== undefined) {
      result[key] = override[key];
    }
  }

  // Merge scenic mode properties
  if (override.mode !== undefined) result.mode = override.mode;
  if (override.backgroundImage !== undefined)
    result.backgroundImage = override.backgroundImage;

  // Deep merge dark overrides
  if (override.dark) {
    result.dark = { ...base.dark };
    for (const key of ALL_COLOR_KEYS) {
      if (override.dark[key] !== undefined) {
        result.dark![key] = override.dark[key];
      }
    }
  }

  return result;
}

/**
 * Resolve the effective theme from layered sources, lowest priority first
 * (e.g. `resolveTheme(presetTheme, appThemeOverrides)`). Missing layers are skipped.
 */
export function resolveTheme(
  ...layers: (ThemeOverrides | null | undefined)[]
): ThemeOverrides {
  // Seed with undefined so the first layer is returned as-is (keeps preset metadata such as shikiTheme).
  return layers.reduce<ThemeOverrides | undefined>((acc, layer) => mergeThemes(acc, layer ?? undefined), undefined) ?? {};
}

const ROLE_INPUT_KEYS = ['background', 'foreground', 'accent', 'info', 'success', 'destructive'] as const;

/**
 * The 6-color contract (+ surface overrides) a theme feeds into the role solver for one mode.
 * Colors the theme leaves out — or that don't parse — fall back to DEFAULT_THEME for that mode,
 * so partial themes (e.g. a `theme.json` that only sets `accent`) layer on top of the default.
 */
export function resolveThemeRoleInput(theme: ThemeOverrides, isDark: boolean): ThemeRoleInput {
  const colors: ThemeColors & SurfaceColors = isDark && theme.dark ? { ...theme, ...theme.dark } : theme;
  const defaults: ThemeColors = isDark ? { ...DEFAULT_THEME, ...DEFAULT_THEME.dark } : DEFAULT_THEME;
  const pick = (value: CSSColor | undefined) => (value && isParseableColor(value) ? value : undefined);

  const input = {} as ThemeRoleInput;
  for (const key of ROLE_INPUT_KEYS) input[key] = pick(colors[key]) ?? defaults[key]!;
  const paper = pick(colors.paper);
  const navigator = pick(colors.navigator);
  const popover = pick(colors.popover);
  const popoverSolid = pick(colors.popoverSolid);
  if (paper) input.paper = paper;
  if (navigator) input.navigator = navigator;
  if (popover) input.popover = popover;
  if (popoverSolid) input.popoverSolid = popoverSolid;
  return input;
}

/**
 * Generate CSS variable declarations for a theme: the 6 base colors plus every contrast-solved role
 * (surfaces, text tiers, status/accent text and solids, focus ring — see theme-roles.ts).
 * The default theme's roles are static CSS in packages/ui/src/styles/tokens.css; this is only needed
 * for presets and overrides.
 * @param theme - Resolved theme object
 * @param isDark - Whether to apply dark mode overrides
 * @returns CSS declarations (no selector)
 */
export function themeToCSS(theme: ThemeOverrides, isDark: boolean = false): string {
  const input = resolveThemeRoleInput(theme, isDark);
  const vars: string[] = ROLE_INPUT_KEYS.map((key) => `--${key}: ${input[key]};`);

  const colors: SurfaceColors = isDark && theme.dark ? { ...theme, ...theme.dark } : theme;
  if (colors.input && isParseableColor(colors.input)) vars.push(`--surface-input: ${colors.input};`);

  // Solve for the mode the background actually is: a light-only theme shown in dark mode keeps
  // light-mode roles instead of being "solved" toward white text on a light background.
  const roleMode = backgroundIsDark(input.background) ? 'dark' : 'light';
  for (const [name, value] of Object.entries(deriveThemeRoles(input, roleMode).vars)) {
    vars.push(`${name}: ${value};`);
  }

  return vars.join('\n  ');
}

/**
 * Hex equivalents of the window canvas (--surface-navigator) for Electron BrowserWindow.
 * The main process cannot use CSS/oklch colors. Kept equal to the solver output for
 * DEFAULT_THEME by __tests__/theme-roles.test.ts.
 */
export const BACKGROUND_HEX = {
  light: '#f2f3f4',
  dark: '#0d0e10',
} as const;

/**
 * Get background color hex value for BrowserWindow backgroundColor.
 * Use this in the main process where CSS variables aren't available.
 */
export function getBackgroundColor(isDark: boolean): string {
  return isDark ? BACKGROUND_HEX.dark : BACKGROUND_HEX.light;
}

/**
 * Default theme ("Craft Agents"): cool neutrals from the Craft app and the brand purple (design spec §2.2).
 * Its solved roles are static CSS in packages/ui/src/styles/tokens.css (asserted by theme-roles.test.ts).
 */
export const DEFAULT_THEME: ThemeOverrides = {
  background: '#fcfdfe',
  foreground: '#1a1c1e',
  accent: 'oklch(0.52 0.19 292)',
  info: 'oklch(0.76 0.15 72)',
  success: 'oklch(0.62 0.15 150)',
  destructive: 'oklch(0.58 0.21 27)',
  dark: {
    background: 'oklch(0.165 0.004 265)',
    foreground: 'oklch(0.945 0.003 265)',
    accent: 'oklch(0.70 0.15 292)',
    info: 'oklch(0.80 0.14 75)',
    success: 'oklch(0.74 0.15 150)',
    destructive: 'oklch(0.70 0.18 25)',
  },
};

// ============================================
// Preset Themes
// ============================================

/**
 * Shiki theme configuration for syntax highlighting
 */
export interface ShikiThemeConfig {
  light?: string;
  dark?: string;
}

/**
 * Extended theme file format with metadata
 * Used for preset themes stored as JSON files
 */
export interface ThemeFile extends ThemeOverrides {
  name?: string;
  description?: string;
  author?: string;
  license?: string;
  source?: string;
  supportedModes?: ('light' | 'dark')[];
  shikiTheme?: ShikiThemeConfig;
}

/**
 * Preset theme with ID and path
 */
export interface PresetTheme {
  id: string; // filename without .json (e.g., 'dracula')
  path: string; // full path to theme.json
  theme: ThemeFile; // parsed theme data
}

/**
 * Default Shiki themes (used when no preset is selected)
 */
export const DEFAULT_SHIKI_THEME: ShikiThemeConfig = {
  light: 'github-light',
  dark: 'github-dark',
};

/**
 * Get Shiki theme name for current mode
 */
export function getShikiTheme(
  shikiConfig: ShikiThemeConfig | undefined,
  isDark: boolean
): string {
  const config = shikiConfig || DEFAULT_SHIKI_THEME;
  return isDark ? config.dark || 'github-dark' : config.light || 'github-light';
}
