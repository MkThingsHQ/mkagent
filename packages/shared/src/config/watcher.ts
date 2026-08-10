import { existsSync, mkdirSync, readFileSync, readdirSync, watch, type FSWatcher } from 'node:fs';
import { basename, join } from 'node:path';
import { platform } from 'node:os';
import { getAppPermissionsDir, permissionsConfigCache } from '../agent/permissions-config.ts';
import { readSessionHeader } from '../sessions/jsonl.ts';
import type { SessionHeader } from '../sessions/types.ts';
import {
  downloadSkillIcon,
  invalidateSkillsCache,
  loadAllSkills,
  loadSkill,
  skillNeedsIconDownload,
} from '../skills/storage.ts';
import type { LoadedSkill } from '../skills/types.ts';
import {
  downloadSourceIcon,
  loadSource,
  loadSourceGuide,
  loadWorkspaceSources,
  sourceNeedsIconDownload,
} from '../sources/storage.ts';
import type { LoadedSource, SourceGuide } from '../sources/types.ts';
import { expandPath } from '../utils/paths.ts';
import { getWorkspacePath } from '../workspaces/storage.ts';
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
import {
  validateConfig,
  validatePreferences,
  validateSource,
  type ValidationResult,
} from './validators.ts';

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
  onSourceChange?: (slug: string, source: LoadedSource | null) => void;
  onSourceGuideChange?: (slug: string, guide: SourceGuide) => void;
  onSourcesListChange?: (sources: LoadedSource[]) => void;
  onSkillChange?: (slug: string, skill: LoadedSkill | null) => void;
  onSkillsListChange?: (skills: LoadedSkill[]) => void;
  onDefaultPermissionsChange?: () => void;
  onWorkspacePermissionsChange?: (workspaceId: string) => void;
  onSourcePermissionsChange?: (sourceSlug: string) => void;
  onSessionMetadataChange?: (sessionId: string, header: SessionHeader) => void;
  onAppThemeChange?: (theme: ThemeOverrides | null) => void;
  onPresetThemesListChange?: (themes: PresetTheme[]) => void;
  onPresetThemeChange?: (id: string, theme: PresetTheme | null) => void;
  onValidationError?: (file: string, result: ValidationResult) => void;
  onError?: (file: string, error: Error) => void;
}

const activeWatchers = new Map<string, string>();
const DEBOUNCE_MS = 100;
const SESSION_META_DEBOUNCE_MS = platform() === 'win32' ? 300 : DEBOUNCE_MS;

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
  private isRunning = false;
  private ownsRegistration = false;
  private knownThemes = new Set<string>();
  private lastLlmConnectionsHash = '';

  constructor(workspaceIdOrPath: string, private callbacks: ConfigWatcherCallbacks) {
    const isPath = workspaceIdOrPath.includes('/') || workspaceIdOrPath.includes('\\');
    if (isPath) {
      this.workspacePath = expandPath(workspaceIdOrPath);
      this.workspaceId = workspaceIdOrPath.split(/[/\\]/).pop() || workspaceIdOrPath;
    } else {
      this.workspaceId = workspaceIdOrPath;
      this.workspacePath = getWorkspacePath(workspaceIdOrPath);
    }
  }

  start(): void {
    if (this.isRunning) return;
    if (activeWatchers.has(this.workspacePath)) return;

    mkdirSync(CONFIG_DIR, { recursive: true });
    mkdirSync(this.workspacePath, { recursive: true });
    mkdirSync(getAppThemesDir(), { recursive: true });
    mkdirSync(getAppPermissionsDir(), { recursive: true });

    activeWatchers.set(this.workspacePath, this.workspaceId);
    this.ownsRegistration = true;
    this.isRunning = true;

    this.watchPath(CONFIG_DIR, false, (_event, filename) => this.handleAppChange(filename));
    this.watchPath(this.workspacePath, true, (_event, filename) => this.handleWorkspaceChange(filename));
    this.watchPath(getAppThemesDir(), false, (_event, filename) => {
      if (filename.endsWith('.json')) this.handlePresetThemeChange(basename(filename, '.json'));
    });
    this.watchPath(getAppPermissionsDir(), false, (_event, filename) => {
      if (filename === 'default.json') this.handleDefaultPermissionsChange();
    });

    this.scanPresetThemes();
    const config = loadStoredConfig();
    this.lastLlmConnectionsHash = JSON.stringify(config?.llmConnections ?? []);
  }

  stop(): void {
    for (const watcher of this.watchers) watcher.close();
    this.watchers = [];
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    if (this.ownsRegistration) activeWatchers.delete(this.workspacePath);
    this.ownsRegistration = false;
    this.isRunning = false;
    this.knownThemes.clear();
  }

  isWatching(): boolean {
    return this.isRunning;
  }

  updateCallbacks(callbacks: Partial<ConfigWatcherCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  notifyFileChange(relativePath: string): void {
    if (!this.isRunning) return;
    const normalized = relativePath.replaceAll('\\', '/');
    const delay = /^sessions\/[^/]+\/session\.jsonl$/.test(normalized)
      ? SESSION_META_DEBOUNCE_MS
      : DEBOUNCE_MS;
    this.debounce(`manual:${this.workspacePath}:${normalized}`, () => {
      this.handleWorkspaceChange(normalized);
    }, delay);
  }

  private watchPath(
    path: string,
    recursive: boolean,
    listener: (event: string, filename: string) => void
  ): void {
    if (!existsSync(path)) return;
    try {
      this.watchers.push(watch(path, { recursive }, (event, filename) => {
        if (!filename) return;
        const normalized = filename.replaceAll('\\', '/');
        const delay = recursive && /^sessions\/[^/]+\/session\.jsonl$/.test(normalized)
          ? SESSION_META_DEBOUNCE_MS
          : DEBOUNCE_MS;
        this.debounce(`${path}:${normalized}`, () => listener(event, normalized), delay);
      }));
    } catch (error) {
      this.callbacks.onError?.(path, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private debounce(key: string, callback: () => void, delay = DEBOUNCE_MS): void {
    const current = this.timers.get(key);
    if (current) clearTimeout(current);
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      callback();
    }, delay));
  }

  private handleAppChange(filename: string): void {
    if (filename === 'config.json') {
      const validation = validateConfig();
      if (!validation.valid) {
        this.callbacks.onValidationError?.('config.json', validation);
        return;
      }
      const config = loadStoredConfig();
      if (config) {
        this.callbacks.onConfigChange?.(config);
        const connections = config.llmConnections ?? [];
        const hash = JSON.stringify(connections);
        if (hash !== this.lastLlmConnectionsHash) {
          this.lastLlmConnectionsHash = hash;
          this.callbacks.onLlmConnectionsChange?.(connections);
        }
      } else {
        this.callbacks.onError?.('config.json', new Error('Failed to load config'));
      }
      return;
    }
    if (filename === 'preferences.json') {
      const validation = validatePreferences();
      if (!validation.valid) {
        this.callbacks.onValidationError?.('preferences.json', validation);
        return;
      }
      const preferences = loadPreferences();
      if (preferences) {
        this.callbacks.onPreferencesChange?.(preferences);
      } else if (existsSync(join(CONFIG_DIR, 'preferences.json'))) {
        this.callbacks.onError?.('preferences.json', new Error('Failed to load preferences'));
      }
      return;
    }
    if (filename === 'theme.json') {
      this.callbacks.onAppThemeChange?.(loadAppTheme());
      return;
    }
  }

  private handleWorkspaceChange(filename: string): void {
    const normalized = filename.replaceAll('\\', '/');
    if (normalized === 'permissions.json') {
      permissionsConfigCache.invalidateWorkspace(this.workspacePath);
      this.callbacks.onWorkspacePermissionsChange?.(this.workspaceId);
      return;
    }
    if (normalized.startsWith('sources/')) {
      const [, slug, file] = normalized.split('/');
      if (!slug) return;

      if (!file) {
        this.callbacks.onSourceChange?.(slug, loadSource(this.workspacePath, slug));
        this.callbacks.onSourcesListChange?.(loadWorkspaceSources(this.workspacePath));
        return;
      }

      if (file === 'permissions.json') {
        permissionsConfigCache.invalidateSource(this.workspacePath, slug);
        this.callbacks.onSourcePermissionsChange?.(slug);
        return;
      }

      if (file === 'guide.md') {
        const guide = loadSourceGuide(this.workspacePath, slug);
        if (guide) this.callbacks.onSourceGuideChange?.(slug, guide);
        this.callbacks.onSourceChange?.(slug, loadSource(this.workspacePath, slug));
        return;
      }

      if (file === 'config.json') {
        const configPath = join(this.workspacePath, 'sources', slug, 'config.json');
        if (!existsSync(configPath)) {
          this.callbacks.onSourceChange?.(slug, null);
          return;
        }

        const validation = validateSource(this.workspacePath, slug);
        if (!validation.valid) {
          this.callbacks.onValidationError?.(`sources/${slug}/config.json`, validation);
          return;
        }

        const source = loadSource(this.workspacePath, slug);
        this.callbacks.onSourceChange?.(slug, source);
        if (source && source.config.icon && sourceNeedsIconDownload(this.workspacePath, slug, source.config)) {
          void downloadSourceIcon(this.workspacePath, slug, source.config.icon)
            .then(() => this.callbacks.onSourceChange?.(slug, loadSource(this.workspacePath, slug)))
            .catch(error => {
              this.callbacks.onError?.(
                `sources/${slug}/icon`,
                error instanceof Error ? error : new Error(String(error)),
              );
            });
        }
        return;
      }
    }
    if (normalized.startsWith('skills/')) {
      const slug = normalized.split('/')[1];
      if (!slug) return;
      invalidateSkillsCache();
      const skill = loadSkill(this.workspacePath, slug);
      this.callbacks.onSkillChange?.(slug, skill);
      this.callbacks.onSkillsListChange?.(loadAllSkills(this.workspacePath));
      if (skill && skillNeedsIconDownload(skill)) {
        void downloadSkillIcon(skill.path, skill.metadata.icon!)
          .then(iconPath => {
            if (!iconPath) return;
            invalidateSkillsCache();
            this.callbacks.onSkillChange?.(slug, loadSkill(this.workspacePath, slug));
          })
          .catch(error => {
            this.callbacks.onError?.(
              `skills/${slug}/icon`,
              error instanceof Error ? error : new Error(String(error)),
            );
          });
      }
      return;
    }
    const sessionMatch = normalized.match(/^sessions\/([^/]+)\/session\.jsonl$/);
    if (sessionMatch?.[1]) {
      const header = readSessionHeader(join(this.workspacePath, normalized));
      if (header) this.callbacks.onSessionMetadataChange?.(sessionMatch[1], header);
    }
  }

  private scanPresetThemes(): void {
    try {
      for (const file of readdirSync(getAppThemesDir())) {
        if (file.endsWith('.json')) this.knownThemes.add(basename(file, '.json'));
      }
    } catch (error) {
      this.callbacks.onError?.(
        getAppThemesDir(),
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  private handlePresetThemeChange(id: string): void {
    const path = join(getAppThemesDir(), `${id}.json`);
    if (!existsSync(path)) {
      if (!this.knownThemes.has(id)) return;
      this.knownThemes.delete(id);
      this.callbacks.onPresetThemeChange?.(id, null);
      this.callbacks.onPresetThemesListChange?.(loadPresetThemes());
      return;
    }

    this.knownThemes.add(id);
    this.callbacks.onPresetThemeChange?.(id, loadPresetTheme(id));
    this.callbacks.onPresetThemesListChange?.(loadPresetThemes());
  }

  private handleDefaultPermissionsChange(): void {
    permissionsConfigCache.invalidateDefaults();
    this.callbacks.onDefaultPermissionsChange?.();
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
