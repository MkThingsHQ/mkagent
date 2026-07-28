import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { permissionsConfigCache } from '../agent/permissions-config.ts';
import { readSessionHeader } from '../sessions/jsonl.ts';
import type { SessionHeader } from '../sessions/types.ts';
import { invalidateSkillsCache, loadAllSkills, loadSkill } from '../skills/storage.ts';
import type { LoadedSkill } from '../skills/types.ts';
import { CONFIG_DIR } from './paths.ts';
import {
  getAppThemesDir,
  loadAppTheme,
  loadPresetTheme,
  loadPresetThemes,
  loadStoredConfig,
  type LlmConnection,
  type StoredConfig,
} from './storage.ts';
import type { PresetTheme, ThemeOverrides } from './theme.ts';

export interface UserPreferences {
  name?: string;
  timezone?: string;
  location?: { city?: string; region?: string; country?: string };
  notes?: string;
  uiLanguage?: string;
  updatedAt?: number;
}

export interface ConfigWatcherCallbacks {
  onConfigChange?: (config: StoredConfig) => void;
  onPreferencesChange?: (preferences: UserPreferences) => void;
  onLlmConnectionsChange?: (connections: LlmConnection[]) => void;
  onSkillChange?: (slug: string, skill: LoadedSkill | null) => void;
  onSkillsListChange?: (skills: LoadedSkill[]) => void;
  onDefaultPermissionsChange?: () => void;
  onWorkspacePermissionsChange?: (workspaceId: string) => void;
  onSessionMetadataChange?: (sessionId: string, header: SessionHeader) => void;
  onAppThemeChange?: (theme: ThemeOverrides | null) => void;
  onPresetThemesChange?: (themes: PresetTheme[]) => void;
  onPresetThemeChange?: (id: string, theme: PresetTheme | null) => void;
  onValidationError?: (file: string, errors: string[]) => void;
}

const activeWatchers = new Map<string, string>();

export function _getActiveWatchers(): ReadonlyMap<string, string> {
  return activeWatchers;
}

export function loadPreferences(): UserPreferences | null {
  const path = join(CONFIG_DIR, 'preferences.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as UserPreferences;
  } catch {
    return null;
  }
}

export class ConfigWatcher {
  private watchers: FSWatcher[] = [];
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly workspacePath: string;
  private readonly workspaceId: string;

  constructor(workspaceIdOrPath: string, private callbacks: ConfigWatcherCallbacks) {
    this.workspacePath = workspaceIdOrPath;
    this.workspaceId = basename(workspaceIdOrPath);
  }

  start(): void {
    if (activeWatchers.has(this.workspacePath)) return;
    activeWatchers.set(this.workspacePath, this.workspaceId);
    this.watchPath(CONFIG_DIR, false, (_event, filename) => this.handleAppChange(filename));
    this.watchPath(this.workspacePath, true, (_event, filename) => this.handleWorkspaceChange(filename));
  }

  stop(): void {
    for (const watcher of this.watchers) watcher.close();
    this.watchers = [];
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    activeWatchers.delete(this.workspacePath);
  }

  updateCallbacks(callbacks: Partial<ConfigWatcherCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  private watchPath(
    path: string,
    recursive: boolean,
    listener: (event: string, filename: string) => void
  ): void {
    if (!existsSync(path)) return;
    try {
      this.watchers.push(watch(path, { recursive }, (event, filename) => {
        if (filename) this.debounce(`${path}:${filename}`, () => listener(event, filename));
      }));
    } catch {
      // A missing or unsupported recursive watcher is non-fatal; clients can refresh manually.
    }
  }

  private debounce(key: string, callback: () => void): void {
    const current = this.timers.get(key);
    if (current) clearTimeout(current);
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      callback();
    }, 100));
  }

  private handleAppChange(filename: string): void {
    if (filename === 'config.json') {
      const config = loadStoredConfig();
      if (config) {
        this.callbacks.onConfigChange?.(config);
        this.callbacks.onLlmConnectionsChange?.(config.llmConnections ?? []);
      }
      return;
    }
    if (filename === 'preferences.json') {
      const preferences = loadPreferences();
      if (preferences) this.callbacks.onPreferencesChange?.(preferences);
      return;
    }
    if (filename === 'theme.json') {
      this.callbacks.onAppThemeChange?.(loadAppTheme());
      return;
    }
    if (filename.startsWith(`${basename(getAppThemesDir())}/`)) {
      const id = basename(filename, '.json');
      this.callbacks.onPresetThemeChange?.(id, loadPresetTheme(id));
      this.callbacks.onPresetThemesChange?.(loadPresetThemes());
      return;
    }
    if (filename === 'permissions/default.json') {
      permissionsConfigCache.invalidateDefaults();
      this.callbacks.onDefaultPermissionsChange?.();
    }
  }

  private handleWorkspaceChange(filename: string): void {
    const normalized = filename.replaceAll('\\', '/');
    if (normalized === 'permissions.json') {
      permissionsConfigCache.invalidateWorkspace(this.workspacePath);
      this.callbacks.onWorkspacePermissionsChange?.(this.workspaceId);
      return;
    }
    if (normalized.startsWith('skills/')) {
      const slug = normalized.split('/')[1];
      if (!slug) return;
      invalidateSkillsCache();
      this.callbacks.onSkillChange?.(slug, loadSkill(this.workspacePath, slug));
      this.callbacks.onSkillsListChange?.(loadAllSkills(this.workspacePath));
      return;
    }
    const sessionMatch = normalized.match(/^sessions\/([^/]+)\/session\.jsonl$/);
    if (sessionMatch?.[1]) {
      const header = readSessionHeader(join(this.workspacePath, normalized));
      if (header) this.callbacks.onSessionMetadataChange?.(sessionMatch[1], header);
    }
  }
}

export function createConfigWatcher(
  workspaceId: string,
  callbacks: ConfigWatcherCallbacks
): ConfigWatcher {
  const watcher = new ConfigWatcher(workspaceId, callbacks);
  watcher.start();
  return watcher;
}
