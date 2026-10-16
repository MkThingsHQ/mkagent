import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react'
import { MotionPreferenceProvider, isMotionPreference, type MotionPreference } from '@mkagent/ui/motion'
import * as storage from '@/lib/local-storage'
import {
  resolveTheme,
  themeToCSS,
  DEFAULT_SHIKI_THEME,
  getShikiTheme,
  type ThemeOverrides,
  type ThemeFile,
  type ShikiThemeConfig,
} from '@config/theme'

export type ThemeMode = 'light' | 'dark' | 'system'
export type FontFamily = 'inter' | 'system'

interface ThemeContextType {
  // Preferences (persisted at app level)
  mode: ThemeMode
  /** App-level default color theme (used when workspace has no override) */
  colorTheme: string
  font: FontFamily
  /** Motion setting: follow the OS, always reduce, or always full */
  motion: MotionPreference
  setMode: (mode: ThemeMode) => void
  /** Set app-level default color theme */
  setColorTheme: (theme: string) => void
  setFont: (font: FontFamily) => void
  setMotion: (motion: MotionPreference) => void

  // Workspace-level theme override
  /** Active workspace ID (null if no workspace context) */
  activeWorkspaceId: string | null
  /** Workspace-specific color theme override (null = inherit from app default) */
  workspaceColorTheme: string | null
  /** Set workspace-specific color theme override (null = inherit) */
  setWorkspaceColorTheme: (theme: string | null) => void

  // Derived/computed
  resolvedMode: 'light' | 'dark'
  systemPreference: 'light' | 'dark'
  /** Effective color theme for rendering (previewColorTheme ?? workspaceColorTheme ?? colorTheme) */
  effectiveColorTheme: string
  /** Temporary preview theme (hover state) - not persisted */
  previewColorTheme: string | null
  /** Set temporary preview theme for hover preview. Pass null to clear. */
  setPreviewColorTheme: (theme: string | null) => void
  /** Where effectiveColorTheme came from for current render cycle */
  effectiveColorThemeSource: 'preview' | 'workspace' | 'app'
  /** How the preset theme was resolved */
  themeResolvedFrom: 'none' | 'ipc' | 'fallback'
  /** Non-fatal theme loading error. Null when theme loaded normally. */
  themeLoadError: string | null

  // Theme resolution (singleton - loaded once)
  /** Loaded preset theme file, null if default or loading */
  presetTheme: ThemeFile | null
  /** Color overrides from ~/.mkagent/theme.json (null when absent) */
  appThemeOverrides: ThemeOverrides | null
  /** Fully resolved theme (preset merged with theme.json overrides) */
  resolvedTheme: ThemeOverrides
  /** Whether dark mode is active (scenic themes force dark) */
  isDark: boolean
  /** Whether theme is scenic mode (background image with glass panels) */
  isScenic: boolean
  /** Shiki syntax highlighting theme name for current mode */
  shikiTheme: string
  /** Shiki theme configuration (light/dark variants) */
  shikiConfig: ShikiThemeConfig
}

interface StoredTheme {
  mode: ThemeMode
  colorTheme: string
  font?: FontFamily
  motion?: MotionPreference
  /** True when user explicitly changed theme in UI (not auto-saved on startup) */
  isUserOverride?: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const bundledThemeModules = import.meta.glob('../../../resources/themes/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, ThemeFile>

const BUNDLED_THEMES = new Map<string, ThemeFile>(
  Object.entries(bundledThemeModules).map(([path, theme]) => {
    const fileName = path.split('/').pop() ?? ''
    const id = fileName.replace('.json', '')
    return [id, theme]
  })
)

interface ThemeProviderProps {
  children: ReactNode
  defaultMode?: ThemeMode
  defaultColorTheme?: string
  defaultFont?: FontFamily
  /** Active workspace ID for workspace-level theme overrides */
  activeWorkspaceId?: string | null
}

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

function loadStoredTheme(): StoredTheme | null {
  if (typeof window === 'undefined') return null
  return storage.get<StoredTheme | null>(storage.KEYS.theme, null)
}

function saveTheme(theme: StoredTheme): void {
  storage.set(storage.KEYS.theme, theme)
}

export function ThemeProvider({
  children,
  defaultMode = 'system',
  defaultColorTheme = 'default',
  defaultFont = 'system',
  activeWorkspaceId = null
}: ThemeProviderProps) {
  const stored = loadStoredTheme()

  // === Preference state (persisted at app level) ===
  const [mode, setModeState] = useState<ThemeMode>(stored?.mode ?? defaultMode)
  // Only use localStorage colorTheme if user explicitly set it via UI
  const [colorTheme, setColorThemeState] = useState<string>(() => {
    if (stored?.isUserOverride && stored.colorTheme) {
      return stored.colorTheme
    }
    return defaultColorTheme // Will be updated by config.json effect
  })
  const [font, setFontState] = useState<FontFamily>(stored?.font ?? defaultFont)
  const [motion, setMotionState] = useState<MotionPreference>(
    stored && isMotionPreference(stored.motion) ? stored.motion : 'system'
  )
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(getSystemPreference)
  const [previewColorTheme, setPreviewColorTheme] = useState<string | null>(null)
  const initialThemePreferences = useRef({ mode, colorTheme, font })

  // === Workspace-level theme override ===
  const [workspaceColorTheme, setWorkspaceColorThemeState] = useState<string | null>(null)

  // Track if we're receiving an external update to prevent echo broadcasts
  const isExternalUpdate = useRef(false)

  // Load app-level colorTheme from config.json on mount (only if user hasn't overridden)
  useEffect(() => {
    // Skip if user has explicitly set a theme via UI
    if (stored?.isUserOverride) return

    window.electronAPI?.getColorTheme?.().then((configTheme) => {
      if (configTheme && configTheme !== 'default') {
        setColorThemeState(configTheme)
      }
    }).catch(() => {
      // Keep default on error
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

  // === Preset theme state (singleton) ===
  const [presetTheme, setPresetTheme] = useState<ThemeFile | null>(null)
  const [themeResolvedFrom, setThemeResolvedFrom] = useState<'none' | 'ipc' | 'fallback'>('none')
  const [themeLoadError, setThemeLoadError] = useState<string | null>(null)

  // ~/.mkagent/theme.json color overrides layer on top of the preset (or the default theme)
  const [appThemeOverrides, setAppThemeOverrides] = useState<ThemeOverrides | null>(null)
  useEffect(() => {
    window.electronAPI?.getAppTheme?.().then(setAppThemeOverrides).catch(() => {
      // No overrides file or no server yet: keep the preset/default theme
    })
    const cleanup = window.electronAPI?.onAppThemeChange?.((theme) => setAppThemeOverrides(theme))
    return () => cleanup?.()
  }, [])

  // === Derived values ===
  const resolvedMode = mode === 'system' ? systemPreference : mode
  // Effective theme: preview > workspace override > app default
  const effectiveColorTheme = previewColorTheme ?? workspaceColorTheme ?? colorTheme
  const effectiveColorThemeSource: 'preview' | 'workspace' | 'app' =
    previewColorTheme !== null ? 'preview' : workspaceColorTheme !== null ? 'workspace' : 'app'
  const isDarkFromMode = resolvedMode === 'dark'

  // Load workspace theme override when workspace changes
  useEffect(() => {
    if (!activeWorkspaceId) {
      setWorkspaceColorThemeState(null)
      return
    }

    window.electronAPI?.getWorkspaceColorTheme?.(activeWorkspaceId).then((theme) => {
      setWorkspaceColorThemeState(theme)
    }).catch(() => {
      setWorkspaceColorThemeState(null)
    })
  }, [activeWorkspaceId])

  // Load preset theme when effectiveColorTheme changes (SINGLETON - only here, not in useTheme)
  useEffect(() => {
    let cancelled = false

    const applyFallback = (reason: string) => {
      const fallbackTheme = BUNDLED_THEMES.get(effectiveColorTheme)
      if (fallbackTheme) {
        if (!cancelled) {
          setPresetTheme(fallbackTheme)
          setThemeResolvedFrom('fallback')
          setThemeLoadError(reason)
        }
        console.warn(`[ThemeContext] ${reason} Falling back to bundled theme: ${effectiveColorTheme}`)
        return
      }

      if (!cancelled) {
        setPresetTheme(null)
        setThemeResolvedFrom('none')
        setThemeLoadError(reason)
      }
      console.error(`[ThemeContext] ${reason} No bundled fallback found for: ${effectiveColorTheme}`)
    }

    if (!effectiveColorTheme || effectiveColorTheme === 'default') {
      setPresetTheme(null)
      setThemeResolvedFrom('none')
      setThemeLoadError(null)
      return () => {
        cancelled = true
      }
    }

    // Load preset theme via IPC (app-level), then fallback to bundled themes.
    // In playground/browser mode electronAPI may exist without loadPresetTheme.
    const loadPresetTheme = window.electronAPI?.loadPresetTheme
    if (!loadPresetTheme) {
      applyFallback(`electronAPI.loadPresetTheme is unavailable for "${effectiveColorTheme}".`)
      return () => {
        cancelled = true
      }
    }

    loadPresetTheme(effectiveColorTheme).then((preset) => {
      if (cancelled) return

      if (preset?.theme) {
        setPresetTheme(preset.theme)
        setThemeResolvedFrom('ipc')
        setThemeLoadError(null)
        return
      }

      applyFallback(`Preset theme was not returned by IPC for "${effectiveColorTheme}".`)
    }).catch((error) => {
      applyFallback(`Failed to load preset theme via IPC for "${effectiveColorTheme}": ${error instanceof Error ? error.message : String(error)}.`)
    })

    return () => {
      cancelled = true
    }
  }, [effectiveColorTheme])

  // Resolve theme (preset → theme.json overrides)
  const resolvedTheme = useMemo(() => {
    return resolveTheme(presetTheme, appThemeOverrides)
  }, [presetTheme, appThemeOverrides])

  // Determine scenic mode (background image with glass panels)
  const isScenic = useMemo(() => {
    return resolvedTheme.mode === 'scenic' && !!resolvedTheme.backgroundImage
  }, [resolvedTheme])

  // Dark-only themes (e.g. Dracula) force dark mode regardless of system mode
  const isDarkOnlyTheme = presetTheme?.supportedModes?.length === 1 && presetTheme.supportedModes[0] === 'dark'

  // isDark reflects actual visual appearance: scenic, dark-only themes, or system dark mode
  const isDark = isScenic || isDarkOnlyTheme ? true : isDarkFromMode

  // Native window material (macOS vibrancy, Windows 11 22H2+ Mica); null on web hosts
  const [windowVibrancy] = useState(() => window.electronAPI?.getWindowVibrancy?.() ?? null)

  // Shiki theme configuration
  const shikiConfig = useMemo(() => {
    return presetTheme?.shikiTheme || DEFAULT_SHIKI_THEME
  }, [presetTheme])

  // Get current Shiki theme name based on mode
  const shikiTheme = useMemo(() => {
    const supportedModes = presetTheme?.supportedModes
    const currentMode = isDark ? 'dark' : 'light'

    // If theme has limited mode support and doesn't include current mode,
    // use the mode it does support for Shiki
    if (supportedModes && supportedModes.length > 0 && !supportedModes.includes(currentMode)) {
      const effectiveMode = supportedModes[0] === 'dark'
      return getShikiTheme(shikiConfig, effectiveMode)
    }

    return getShikiTheme(shikiConfig, isDark)
  }, [shikiConfig, isDark, presetTheme])

  // === DOM Effects (SINGLETON - all theme DOM manipulation happens here) ===

  // Apply base theme class and data attributes
  useEffect(() => {
    const root = document.documentElement

    // Apply font
    if (font === 'inter') {
      root.dataset.font = 'inter'
    } else {
      delete root.dataset.font
    }

    // Apply color theme data attribute
    if (effectiveColorTheme && effectiveColorTheme !== 'default') {
      root.dataset.theme = effectiveColorTheme
    } else {
      delete root.dataset.theme
    }
  }, [effectiveColorTheme, font])

  // Apply dark/light class and theme-specific DOM attributes
  // This runs when preset loads or mode changes
  useEffect(() => {
    const root = document.documentElement

    // Check if this is a dark-only theme (forces dark mode)
    const isDarkOnlyTheme = presetTheme?.supportedModes?.length === 1 && presetTheme.supportedModes[0] === 'dark'

    // Apply mode class
    // Scenic and dark-only themes force dark mode
    const effectiveMode = (isScenic || isDarkOnlyTheme) ? 'dark' : resolvedMode
    root.classList.remove('light', 'dark')
    root.classList.add(effectiveMode)

    // The canvas is translucent (data-vibrancy) only over a native vibrancy/Mica material whose
    // appearance matches what we paint: the material follows the OS, so a mode that differs from
    // the OS (or a dark-only theme in light mode, or a scenic image) paints solid instead.
    const supportedModes = presetTheme?.supportedModes
    const currentMode = isDarkFromMode ? 'dark' : 'light'
    const themeModeUnsupported = supportedModes && supportedModes.length > 0 && !supportedModes.includes(currentMode)
    const translucent = !!windowVibrancy && !isScenic && !themeModeUnsupported && resolvedMode === systemPreference
    if (translucent) {
      root.dataset.vibrancy = windowVibrancy
    } else {
      delete root.dataset.vibrancy
    }

    // Set scenic mode data attribute for CSS targeting
    if (isScenic) {
      root.dataset.scenic = 'true'
      if (resolvedTheme.backgroundImage) {
        root.style.setProperty('--background-image', `url("${resolvedTheme.backgroundImage}")`)
      }
    } else {
      delete root.dataset.scenic
      root.style.removeProperty('--background-image')
    }

  }, [presetTheme, resolvedMode, systemPreference, isScenic, resolvedTheme, isDarkFromMode, windowVibrancy])

  // Inject CSS variables
  useEffect(() => {
    const styleId = 'craft-theme-overrides'
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null

    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }

    const usesPreset = !!effectiveColorTheme && effectiveColorTheme !== 'default'

    // Keep the current CSS while a preset loads (prevents a flash of wrong values)
    if (usesPreset && !presetTheme && !themeLoadError) return

    // Default theme without theme.json overrides: the static roles in tokens.css apply
    if (!presetTheme && !appThemeOverrides) {
      styleEl.textContent = ''
      return
    }

    // Base colors + contrast-solved roles for the preset and/or theme.json overrides
    styleEl.textContent = `:root {\n  ${themeToCSS(resolvedTheme, isDark)}\n}`
  }, [effectiveColorTheme, presetTheme, appThemeOverrides, themeLoadError, resolvedTheme, isDark])

  // === System preference listener ===
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handleMediaChange)

    // Listen via Electron IPC if available (more reliable on macOS)
    let cleanup: (() => void) | undefined
    if (window.electronAPI?.onSystemThemeChange) {
      cleanup = window.electronAPI.onSystemThemeChange((isDark) => {
        setSystemPreference(isDark ? 'dark' : 'light')
      })
    }

    // Fetch initial system theme from Electron
    if (window.electronAPI?.getSystemTheme) {
      window.electronAPI.getSystemTheme().then((isDark) => {
        setSystemPreference(isDark ? 'dark' : 'light')
      })
    }

    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange)
      cleanup?.()
    }
  }, [])

  // === Cross-window sync listener ===
  useEffect(() => {
    if (!window.electronAPI?.onThemePreferencesChange) return

    const cleanup = window.electronAPI.onThemePreferencesChange((preferences) => {
      isExternalUpdate.current = true
      setModeState(preferences.mode as ThemeMode)
      setColorThemeState(preferences.colorTheme)
      setFontState(preferences.font as FontFamily)
      const syncedMotion = isMotionPreference(preferences.motion) ? preferences.motion : undefined
      if (syncedMotion) setMotionState(syncedMotion)
      // When syncing from another window, mark as user override since user explicitly changed theme
      saveTheme({
        mode: preferences.mode as ThemeMode,
        colorTheme: preferences.colorTheme,
        font: preferences.font as FontFamily,
        motion: syncedMotion ?? loadStoredTheme()?.motion,
        isUserOverride: true
      })
      setTimeout(() => {
        isExternalUpdate.current = false
      }, 0)
    })

    return cleanup
  }, [])

  // Hydrate host-managed auxiliary windows (such as Browser Window) on app
  // startup. Setter broadcasts alone are insufficient when a saved override is
  // restored from localStorage without the user changing it in this process.
  useEffect(() => {
    void window.electronAPI?.broadcastThemePreferences?.(initialThemePreferences.current)
  }, [])

  // === Setters with persistence and broadcast ===
  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode)
    // Preserve existing isUserOverride flag
    const existing = loadStoredTheme()
    saveTheme({ mode: newMode, colorTheme, font, motion, isUserOverride: existing?.isUserOverride })
    if (!isExternalUpdate.current && window.electronAPI?.broadcastThemePreferences) {
      window.electronAPI.broadcastThemePreferences({ mode: newMode, colorTheme, font, motion })
    }
  }, [colorTheme, font, motion])

  const setColorTheme = useCallback((newTheme: string) => {
    setColorThemeState(newTheme)
    // Mark as user override - user explicitly changed theme via UI
    saveTheme({ mode, colorTheme: newTheme, font, motion, isUserOverride: true })
    if (!isExternalUpdate.current && window.electronAPI?.broadcastThemePreferences) {
      window.electronAPI.broadcastThemePreferences({ mode, colorTheme: newTheme, font, motion })
    }
  }, [mode, font, motion])

  const setFont = useCallback((newFont: FontFamily) => {
    setFontState(newFont)
    // Preserve existing isUserOverride flag
    const existing = loadStoredTheme()
    saveTheme({ mode, colorTheme, font: newFont, motion, isUserOverride: existing?.isUserOverride })
    if (!isExternalUpdate.current && window.electronAPI?.broadcastThemePreferences) {
      window.electronAPI.broadcastThemePreferences({ mode, colorTheme, font: newFont, motion })
    }
  }, [mode, colorTheme, motion])

  const setMotion = useCallback((newMotion: MotionPreference) => {
    setMotionState(newMotion)
    // Preserve existing isUserOverride flag
    const existing = loadStoredTheme()
    saveTheme({ mode, colorTheme, font, motion: newMotion, isUserOverride: existing?.isUserOverride })
    if (!isExternalUpdate.current && window.electronAPI?.broadcastThemePreferences) {
      window.electronAPI.broadcastThemePreferences({ mode, colorTheme, font, motion: newMotion })
    }
  }, [mode, colorTheme, font])

  // Set workspace-specific color theme override
  const setWorkspaceColorTheme = useCallback((newTheme: string | null) => {
    if (!activeWorkspaceId) return
    setWorkspaceColorThemeState(newTheme)
    window.electronAPI?.setWorkspaceColorTheme?.(activeWorkspaceId, newTheme)
    // Broadcast to other windows
    window.electronAPI?.broadcastWorkspaceThemeChange?.(activeWorkspaceId, newTheme)
  }, [activeWorkspaceId])

  // Listen for workspace theme changes from other windows
  useEffect(() => {
    if (!window.electronAPI?.onWorkspaceThemeChange) return

    const cleanup = window.electronAPI.onWorkspaceThemeChange(({ workspaceId, themeId }) => {
      // Only update if this is our active workspace
      if (workspaceId === activeWorkspaceId) {
        setWorkspaceColorThemeState(themeId)
      }
    })

    return cleanup
  }, [activeWorkspaceId])

  return (
    <ThemeContext.Provider
      value={{
        // App-level preferences
        mode,
        colorTheme,
        font,
        motion,
        setMode,
        setColorTheme,
        setFont,
        setMotion,

        // Workspace-level theme override
        activeWorkspaceId,
        workspaceColorTheme,
        setWorkspaceColorTheme,

        // Derived
        resolvedMode,
        systemPreference,
        effectiveColorTheme,
        previewColorTheme,
        setPreviewColorTheme,
        effectiveColorThemeSource,
        themeResolvedFrom,
        themeLoadError,

        // Theme resolution (singleton)
        presetTheme,
        appThemeOverrides,
        resolvedTheme,
        isDark,
        isScenic,
        shikiTheme,
        shikiConfig,
      }}
    >
      <MotionPreferenceProvider preference={motion}>{children}</MotionPreferenceProvider>
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
