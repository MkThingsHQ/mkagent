import {
  ConfigWatcher,
  createConfigWatcher,
  type ConfigWatcherCallbacks,
} from '../../config/watcher.ts';
import type { LoadedSkill } from '../../skills/types.ts';
import { debug } from '../../utils/debug.ts';

export interface ConfigWatcherManagerCallbacks {
  onSkillChange?: (slug: string, skill: LoadedSkill | null) => void;
  onSkillsListChange?: (skills: LoadedSkill[]) => void;
  onWorkspacePermissionsChange?: (workspaceId: string) => void;
  onDefaultPermissionsChange?: () => void;
  onValidationError?: (file: string, errors: string[]) => void;
}

export interface ConfigWatcherManagerConfig {
  workspaceRootPath: string;
  isHeadless?: boolean;
  onDebug?: (message: string) => void;
}

export class ConfigWatcherManager {
  private watcher: ConfigWatcher | null = null;
  private readonly workspaceRootPath: string;
  private readonly isHeadless: boolean;
  private callbacks: ConfigWatcherManagerCallbacks;
  private readonly onDebugCallback: ((message: string) => void) | null;

  constructor(config: ConfigWatcherManagerConfig, callbacks: ConfigWatcherManagerCallbacks = {}) {
    this.workspaceRootPath = config.workspaceRootPath;
    this.isHeadless = config.isHeadless ?? false;
    this.callbacks = callbacks;
    this.onDebugCallback = config.onDebug ?? null;
  }

  start(): void {
    if (this.watcher) return;
    if (this.isHeadless) {
      this.log('Config watching disabled in headless mode');
      return;
    }

    const watcherCallbacks: ConfigWatcherCallbacks = {
      onSkillChange: (slug, skill) => {
        this.log(`Skill changed: ${slug} ${skill ? 'updated' : 'deleted'}`);
        this.callbacks.onSkillChange?.(slug, skill);
      },
      onSkillsListChange: skills => {
        this.log(`Skills list changed: ${skills.length} skills`);
        this.callbacks.onSkillsListChange?.(skills);
      },
      onWorkspacePermissionsChange: workspaceId => {
        this.log(`Workspace permissions changed: ${workspaceId}`);
        this.callbacks.onWorkspacePermissionsChange?.(workspaceId);
      },
      onDefaultPermissionsChange: () => {
        this.log('Default permissions changed');
        this.callbacks.onDefaultPermissionsChange?.();
      },
      onValidationError: (file, result) => {
        const errors = result.errors.map(error =>
          `${error.path ? `${error.path}: ` : ''}${error.message}`
        );
        this.log(`Config validation error: ${file} - ${errors.join(', ')}`);
        this.callbacks.onValidationError?.(file, errors);
      },
    };

    const watcher = createConfigWatcher(this.workspaceRootPath, watcherCallbacks);
    if (!watcher.isWatching()) {
      this.log('Config watcher already owned by another manager');
      return;
    }
    this.watcher = watcher;
    this.log('Config watcher started');
  }

  stop(): void {
    if (!this.watcher) return;
    this.watcher.stop();
    this.watcher = null;
    this.log('Config watcher stopped');
  }

  isRunning(): boolean {
    return this.watcher !== null;
  }

  updateCallbacks(callbacks: Partial<ConfigWatcherManagerCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  getWorkspaceRootPath(): string {
    return this.workspaceRootPath;
  }

  private log(message: string): void {
    const formatted = `[ConfigWatcherManager] ${message}`;
    this.onDebugCallback?.(formatted);
    debug(formatted);
  }
}

export function createConfigWatcherManager(
  config: ConfigWatcherManagerConfig,
  callbacks: ConfigWatcherManagerCallbacks = {},
  autoStart = true
): ConfigWatcherManager {
  const manager = new ConfigWatcherManager(config, callbacks);
  if (autoStart) manager.start();
  return manager;
}
