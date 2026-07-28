/**
 * Workspace Storage
 *
 * CRUD operations for workspaces.
 * Workspaces can be stored anywhere on disk via rootPath.
 * Default location: ~/.mkagent/workspaces/
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { expandPath, toPortablePath } from '../utils/paths.ts';
import { atomicWriteFileSync, readJsonFileSync } from '../utils/files.ts';
import { loadConfigDefaults } from '../config/storage.ts';
import { parsePermissionMode, PERMISSION_MODE_ORDER } from '../agent/mode-types.ts';
import { normalizeThinkingLevel } from '../agent/thinking-levels.ts';
import { CONFIG_DIR } from '../config/paths.ts';
import type {
  WorkspaceConfig,
  CreateWorkspaceInput,
  LoadedWorkspace,
  WorkspaceSummary,
} from './types.ts';

const DEFAULT_WORKSPACES_DIR = join(CONFIG_DIR, 'workspaces');
export const DEFAULT_WORKSPACE_SLUG = 'default';

// ============================================================
// Path Utilities
// ============================================================

/**
 * Get the default workspaces directory (~/.mkagent/workspaces/)
 */
export function getDefaultWorkspacesDir(): string {
  return DEFAULT_WORKSPACES_DIR;
}

/**
 * Ensure default workspaces directory exists
 */
export function ensureDefaultWorkspacesDir(): void {
  if (!existsSync(DEFAULT_WORKSPACES_DIR)) {
    mkdirSync(DEFAULT_WORKSPACES_DIR, { recursive: true });
  }
}

/** Ensure the local default workspace exists and return its configuration. */
export function ensureDefaultWorkspace(): WorkspaceConfig {
  ensureDefaultWorkspacesDir();
  const rootPath = join(DEFAULT_WORKSPACES_DIR, DEFAULT_WORKSPACE_SLUG);
  const existing = loadWorkspaceConfig(rootPath);
  if (existing) return existing;
  return createWorkspaceAtPath(rootPath, 'Default');
}

/**
 * Get workspace root path from ID
 * @param workspaceId - Workspace ID
 * @returns Absolute path to workspace root in default location
 */
export function getWorkspacePath(workspaceId: string): string {
  return join(DEFAULT_WORKSPACES_DIR, workspaceId);
}

/**
 * Get path to workspace sessions directory
 * @param rootPath - Absolute path to workspace root folder
 */
export function getWorkspaceSessionsPath(rootPath: string): string {
  return join(rootPath, 'sessions');
}

/**
 * Get path to workspace skills directory
 * @param rootPath - Absolute path to workspace root folder
 */
export function getWorkspaceSkillsPath(rootPath: string): string {
  return join(rootPath, 'skills');
}

// ============================================================
// Config Operations
// ============================================================

/**
 * Load workspace config.json from a workspace folder
 * @param rootPath - Absolute path to workspace root folder
 */
export function loadWorkspaceConfig(rootPath: string): WorkspaceConfig | null {
  const configPath = join(rootPath, 'config.json');
  if (!existsSync(configPath)) return null;

  try {
    const config = readJsonFileSync<WorkspaceConfig>(configPath);

    // Expand path variables in defaults for portability
    if (config.defaults?.workingDirectory) {
      config.defaults.workingDirectory = expandPath(config.defaults.workingDirectory);
    }

    // Compatibility: accept canonical or legacy permission mode names on read
    if (config.defaults?.permissionMode && typeof config.defaults.permissionMode === 'string') {
      const parsed = parsePermissionMode(config.defaults.permissionMode);
      config.defaults.permissionMode = parsed ?? undefined;
    }

    if (Array.isArray(config.defaults?.cyclablePermissionModes)) {
      const normalized = config.defaults.cyclablePermissionModes
        .map(mode => (typeof mode === 'string' ? parsePermissionMode(mode) : null))
        .filter((mode): mode is NonNullable<typeof mode> => !!mode)
        .filter((mode, index, arr) => arr.indexOf(mode) === index);

      config.defaults.cyclablePermissionModes = normalized.length >= 2
        ? normalized
        : [...PERMISSION_MODE_ORDER];
    }

    if (config.defaults && 'thinkingLevel' in config.defaults) {
      // TODO: Remove legacy 'think' normalization after old persisted workspace configs
      // have realistically aged out across upgrades.
      config.defaults.thinkingLevel = normalizeThinkingLevel(config.defaults.thinkingLevel);
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * Save workspace config.json to a workspace folder
 * @param rootPath - Absolute path to workspace root folder
 */
export function saveWorkspaceConfig(rootPath: string, config: WorkspaceConfig): void {
  if (!existsSync(rootPath)) {
    mkdirSync(rootPath, { recursive: true });
  }

  // Convert paths to portable form for cross-machine compatibility
  const storageConfig: WorkspaceConfig = {
    ...config,
    updatedAt: Date.now(),
  };

  if (storageConfig.defaults?.workingDirectory) {
    storageConfig.defaults = {
      ...storageConfig.defaults,
      workingDirectory: toPortablePath(storageConfig.defaults.workingDirectory),
    };
  }

  // Use atomic write to prevent corruption on crash/interrupt
  atomicWriteFileSync(join(rootPath, 'config.json'), JSON.stringify(storageConfig, null, 2));
}

// ============================================================
// Load Operations
// ============================================================

/**
 * Count subdirectories in a path
 */
function countSubdirs(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;
  try {
    return readdirSync(dirPath, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  } catch {
    return 0;
  }
}

/**
 * List subdirectory names in a path
 */
function listSubdirNames(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * Load workspace with summary info from a rootPath
 * @param rootPath - Absolute path to workspace root folder
 */
export function loadWorkspace(rootPath: string): LoadedWorkspace | null {
  const config = loadWorkspaceConfig(rootPath);
  if (!config) return null;

  // Ensure skills directory exists (migration for existing workspaces)
  const skillsPath = getWorkspaceSkillsPath(rootPath);
  if (!existsSync(skillsPath)) {
    mkdirSync(skillsPath, { recursive: true });
  }

  return {
    config,
    sessionCount: countSubdirs(getWorkspaceSessionsPath(rootPath)),
  };
}

/**
 * Get workspace summary from a rootPath
 * @param rootPath - Absolute path to workspace root folder
 */
export function getWorkspaceSummary(rootPath: string): WorkspaceSummary | null {
  const config = loadWorkspaceConfig(rootPath);
  if (!config) return null;

  return {
    slug: config.slug,
    name: config.name,
    sessionCount: countSubdirs(getWorkspaceSessionsPath(rootPath)),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

// ============================================================
// Create/Delete Operations
// ============================================================

/**
 * Generate URL-safe slug from name
 */
export function generateSlug(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  if (!slug) {
    slug = 'workspace';
  }

  return slug;
}

/**
 * Generate a unique folder path for a workspace by appending a numeric suffix
 * if the slug-based folder already exists.
 * E.g., "my-workspace", "my-workspace-2", "my-workspace-3", ...
 *
 * @param name - Display name to derive the slug from
 * @param baseDir - Parent directory where workspace folders live (e.g., ~/.mkagent/workspaces/)
 * @returns Full path to a unique, non-existing folder
 */
export function generateUniqueWorkspacePath(name: string, baseDir: string): string {
  const slug = generateSlug(name);
  let candidate = join(baseDir, slug);

  if (!existsSync(candidate)) {
    return candidate;
  }

  // Append numeric suffix until we find a non-existing path
  let counter = 2;
  while (existsSync(join(baseDir, `${slug}-${counter}`))) {
    counter++;
  }

  return join(baseDir, `${slug}-${counter}`);
}

/**
 * Create workspace folder structure at a given path
 * @param rootPath - Absolute path where workspace folder will be created
 * @param name - Display name for the workspace
 * @param defaults - Optional default settings for new sessions
 * @returns The created WorkspaceConfig
 */
export function createWorkspaceAtPath(
  rootPath: string,
  name: string,
  defaults?: WorkspaceConfig['defaults']
): WorkspaceConfig {
  const now = Date.now();
  const slug = generateSlug(name);

  // Load global defaults from config-defaults.json
  let globalDefaults: ReturnType<typeof loadConfigDefaults>;
  try {
    globalDefaults = loadConfigDefaults();
  } catch {
    // Headless and CLI entrypoints may create the default workspace before
    // bundled assets have been synchronized.
    globalDefaults = {
      version: '1.0',
      description: 'Fallback defaults',
      defaults: {
        notificationsEnabled: true,
        colorTheme: 'default',
        autoCapitalisation: true,
        sendMessageKey: 'enter',
        spellCheck: false,
        keepAwakeWhileRunning: false,
        richToolDescriptions: true,
        extendedPromptCache: false,
        browserToolEnabled: true,
      },
      workspaceDefaults: {
        thinkingLevel: 'medium',
        permissionMode: 'safe',
        cyclablePermissionModes: ['safe', 'allow-all'],
      },
    };
  }

  // Merge global defaults with provided defaults
  // AI settings (model, thinkingLevel, defaultLlmConnection) are left undefined
  // so they fall back to app-level defaults
  const workspaceDefaults: WorkspaceConfig['defaults'] = {
    model: undefined,
    thinkingLevel: undefined,
    // defaultLlmConnection: undefined - falls back to app default
    permissionMode: globalDefaults.workspaceDefaults.permissionMode,
    cyclablePermissionModes: globalDefaults.workspaceDefaults.cyclablePermissionModes,
    workingDirectory: undefined,
    ...defaults, // User-provided defaults override global defaults
  };

  const config: WorkspaceConfig = {
    id: `ws_${randomUUID().slice(0, 8)}`,
    name,
    slug,
    defaults: workspaceDefaults,
    createdAt: now,
    updatedAt: now,
  };

  // Create workspace directory structure
  mkdirSync(rootPath, { recursive: true });
  mkdirSync(getWorkspaceSessionsPath(rootPath), { recursive: true });
  mkdirSync(getWorkspaceSkillsPath(rootPath), { recursive: true });

  // Save config
  saveWorkspaceConfig(rootPath, config);

  return config;
}

/**
 * Delete a workspace folder and all its contents
 * @param rootPath - Absolute path to workspace root folder
 */
export function deleteWorkspaceFolder(rootPath: string): boolean {
  if (!existsSync(rootPath)) return false;

  try {
    rmSync(rootPath, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a valid workspace exists at a path
 * @param rootPath - Absolute path to check
 */
export function isValidWorkspace(rootPath: string): boolean {
  return existsSync(join(rootPath, 'config.json'));
}

/**
 * Rename a workspace (updates config.json in the workspace folder)
 * @param rootPath - Absolute path to workspace root folder
 * @param newName - New display name
 */
export function renameWorkspaceFolder(rootPath: string, newName: string): boolean {
  const config = loadWorkspaceConfig(rootPath);
  if (!config) return false;

  config.name = newName.trim();
  saveWorkspaceConfig(rootPath, config);
  return true;
}

// ============================================================
// Auto-Discovery (for default workspace location)
// ============================================================

/**
 * Discover workspace folders in the default location that have valid config.json
 * Returns paths to valid workspaces found in ~/.mkagent/workspaces/
 */
export function discoverWorkspacesInDefaultLocation(): string[] {
  const discovered: string[] = [];

  if (!existsSync(DEFAULT_WORKSPACES_DIR)) {
    return discovered;
  }

  try {
    const entries = readdirSync(DEFAULT_WORKSPACES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const rootPath = join(DEFAULT_WORKSPACES_DIR, entry.name);
      if (isValidWorkspace(rootPath)) {
        discovered.push(rootPath);
      }
    }
  } catch {
    // Ignore errors scanning directory
  }

  return discovered;
}

// ============================================================
// Workspace Color Theme
// ============================================================

/**
 * Get the color theme setting for a workspace.
 * Returns undefined if workspace uses the app default.
 *
 * @param rootPath - Absolute path to workspace root folder
 * @returns Theme ID or undefined (inherit from app default)
 */
export function getWorkspaceColorTheme(rootPath: string): string | undefined {
  const config = loadWorkspaceConfig(rootPath);
  return config?.defaults?.colorTheme;
}

/**
 * Set the color theme for a workspace.
 * Pass undefined to clear and use app default.
 *
 * @param rootPath - Absolute path to workspace root folder
 * @param themeId - Preset theme ID or undefined to inherit
 */
export function setWorkspaceColorTheme(rootPath: string, themeId: string | undefined): void {
  const config = loadWorkspaceConfig(rootPath);
  if (!config) return;

  // Validate theme ID if provided (skip for undefined = inherit default)
  // Only allow alphanumeric characters, hyphens, and underscores (max 64 chars)
  if (themeId && themeId !== 'default') {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(themeId)) {
      console.warn(`[workspace-storage] Invalid theme ID rejected: ${themeId}`);
      return;
    }
  }

  // Initialize defaults if not present
  if (!config.defaults) {
    config.defaults = {};
  }

  if (themeId) {
    config.defaults.colorTheme = themeId;
  } else {
    delete config.defaults.colorTheme;
  }

  saveWorkspaceConfig(rootPath, config);
}

// ============================================================
// Exports
// ============================================================

export { CONFIG_DIR, DEFAULT_WORKSPACES_DIR };
