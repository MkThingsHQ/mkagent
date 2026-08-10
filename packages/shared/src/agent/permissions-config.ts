import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR, getConfigDir } from '../config/paths.ts';
import { isValidPermissionsFile } from '../config/validators.ts';
import { debug } from '../utils/debug.ts';
import { readJsonFileSync, safeJsonParse } from '../utils/files.ts';
import { getBundledAssetsDir } from '../utils/paths.ts';
import { getSourcePath } from '../sources/storage.ts';
import {
  PermissionsConfigSchema,
  SAFE_MODE_CONFIG,
  type BlockedCommandHintRule,
  type ApiEndpointRule,
  type CompiledApiEndpointRule,
  type CompiledBashPattern,
  type CompiledBlockedCommandHint,
  type PermissionPaths,
  type PermissionsConfigFile,
} from './mode-types.ts';

export {
  PermissionsConfigSchema,
  type ApiEndpointRule,
  type CompiledApiEndpointRule,
  type CompiledBashPattern,
  type PermissionPaths,
  type PermissionsConfigFile,
};

export interface PatternWithComment {
  pattern: string;
  comment?: string;
}

export interface PermissionsCustomConfig {
  allowedBashPatterns: PatternWithComment[];
  allowedMcpPatterns: string[];
  allowedApiEndpoints: ApiEndpointRule[];
  allowedWritePaths: string[];
  blockedCommandHints: BlockedCommandHintRule[];
}

export interface MergedPermissionsConfig {
  blockedTools: Set<string>;
  readOnlyBashPatterns: CompiledBashPattern[];
  blockedCommandHints: CompiledBlockedCommandHint[];
  readOnlyMcpPatterns: RegExp[];
  allowedApiEndpoints: CompiledApiEndpointRule[];
  allowedWritePaths: string[];
  displayName: string;
  shortcutHint: string;
  permissionPaths?: PermissionPaths;
}

export interface PermissionsContext {
  workspaceRootPath: string;
  activeSourceSlugs?: string[];
}

let permissionsInitialized = false;

export function getAppPermissionsDir(): string {
  return join(getConfigDir(), 'permissions');
}

export function ensureDefaultPermissions(): void {
  if (permissionsInitialized) return;
  permissionsInitialized = true;
  const bundledDir = getBundledAssetsDir('permissions');
  if (!bundledDir) return;
  const source = join(bundledDir, 'default.json');
  const targetDir = getAppPermissionsDir();
  const target = join(targetDir, 'default.json');
  if (!existsSync(source)) return;
  mkdirSync(targetDir, { recursive: true });
  if (!existsSync(target) || !isValidPermissionsFile(target)) {
    writeFileSync(target, readFileSync(source, 'utf-8'), 'utf-8');
    return;
  }

  const bundled = PermissionsConfigSchema.safeParse(readJsonFileSync(source));
  const installed = PermissionsConfigSchema.safeParse(readJsonFileSync(target));
  if (!bundled.success || !installed.success) return;
  if (!bundled.data.version || bundled.data.version <= (installed.data.version ?? '')) return;

  const mergeByKey = <T>(current: T[] = [], defaults: T[] = [], key: (value: T) => string): T[] => {
    const seen = new Set(current.map(key));
    return [...current, ...defaults.filter(value => !seen.has(key(value)))];
  };
  const patternKey = (value: string | { pattern: string }): string =>
    typeof value === 'string' ? value : value.pattern;
  const hintKey = (value: BlockedCommandHintRule): string =>
    `${value.command}:${value.whenNotMatching ?? ''}:${value.reason}`;

  writeFileSync(
    target,
    `${JSON.stringify({
      ...installed.data,
      version: bundled.data.version,
      allowedBashPatterns: mergeByKey(
        installed.data.allowedBashPatterns,
        bundled.data.allowedBashPatterns,
        patternKey
      ),
      allowedWritePaths: mergeByKey(
        installed.data.allowedWritePaths,
        bundled.data.allowedWritePaths,
        patternKey
      ),
      blockedCommandHints: mergeByKey(
        installed.data.blockedCommandHints,
        bundled.data.blockedCommandHints,
        hintKey
      ),
    }, null, 2)}\n`,
    'utf-8'
  );
}

function emptyConfig(): PermissionsCustomConfig {
  return {
    allowedBashPatterns: [],
    allowedMcpPatterns: [],
    allowedApiEndpoints: [],
    allowedWritePaths: [],
    blockedCommandHints: [],
  };
}

export function parsePermissionsJson(content: string): PermissionsCustomConfig {
  try {
    const result = PermissionsConfigSchema.safeParse(safeJsonParse(content));
    if (!result.success) return emptyConfig();
    const normalize = (value: string | { pattern: string; comment?: string }): PatternWithComment =>
      typeof value === 'string' ? { pattern: value } : value;
    const normalizePath = (value: string | { pattern: string }): string =>
      typeof value === 'string' ? value : value.pattern;
    return {
      allowedBashPatterns: (result.data.allowedBashPatterns ?? []).map(normalize),
      allowedMcpPatterns: (result.data.allowedMcpPatterns ?? []).map(normalizePath),
      allowedApiEndpoints: result.data.allowedApiEndpoints ?? [],
      allowedWritePaths: (result.data.allowedWritePaths ?? []).map(normalizePath),
      blockedCommandHints: result.data.blockedCommandHints ?? [],
    };
  } catch {
    return emptyConfig();
  }
}

export function validatePermissionsConfig(content: string): {
  valid: boolean;
  errors: string[];
} {
  try {
    const result = PermissionsConfigSchema.safeParse(safeJsonParse(content));
    return result.success
      ? { valid: true, errors: [] }
      : { valid: false, errors: result.error.issues.map(issue => issue.message) };
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

export function getWorkspacePermissionsPath(workspaceRootPath: string): string {
  return join(workspaceRootPath, 'permissions.json');
}

export function getSourcePermissionsPath(workspaceRootPath: string, sourceSlug: string): string {
  return join(getSourcePath(workspaceRootPath, sourceSlug), 'permissions.json');
}

export function loadDefaultPermissions(): PermissionsCustomConfig | null {
  const path = join(getAppPermissionsDir(), 'default.json');
  return existsSync(path) ? parsePermissionsJson(readFileSync(path, 'utf-8')) : null;
}

export function loadWorkspacePermissionsConfig(
  workspaceRootPath: string
): PermissionsCustomConfig | null {
  const path = getWorkspacePermissionsPath(workspaceRootPath);
  return existsSync(path) ? parsePermissionsJson(readFileSync(path, 'utf-8')) : null;
}

export function loadSourcePermissionsConfig(
  workspaceRootPath: string,
  sourceSlug: string,
): PermissionsCustomConfig | null {
  const path = getSourcePermissionsPath(workspaceRootPath, sourceSlug);
  return existsSync(path) ? parsePermissionsJson(readFileSync(path, 'utf-8')) : null;
}

export function loadRawWorkspacePermissions(
  workspaceRootPath: string
): PermissionsConfigFile | null {
  const path = getWorkspacePermissionsPath(workspaceRootPath);
  if (!existsSync(path)) return null;
  const result = PermissionsConfigSchema.safeParse(readJsonFileSync(path));
  return result.success ? result.data : null;
}

export function loadRawSourcePermissions(
  workspaceRootPath: string,
  sourceSlug: string,
): PermissionsConfigFile | null {
  const path = getSourcePermissionsPath(workspaceRootPath, sourceSlug);
  if (!existsSync(path)) return null;
  const result = PermissionsConfigSchema.safeParse(readJsonFileSync(path));
  return result.success ? result.data : null;
}

export function saveWorkspacePermissions(
  workspaceRootPath: string,
  config: PermissionsConfigFile
): void {
  mkdirSync(workspaceRootPath, { recursive: true });
  writeFileSync(
    getWorkspacePermissionsPath(workspaceRootPath),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf-8'
  );
  permissionsConfigCache.invalidateWorkspace(workspaceRootPath);
}

export function saveSourcePermissions(
  workspaceRootPath: string,
  sourceSlug: string,
  config: PermissionsConfigFile,
): void {
  const sourcePath = getSourcePath(workspaceRootPath, sourceSlug);
  mkdirSync(sourcePath, { recursive: true });
  writeFileSync(
    getSourcePermissionsPath(workspaceRootPath, sourceSlug),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf-8',
  );
  permissionsConfigCache.invalidateSource(workspaceRootPath, sourceSlug);
}

function compileRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

function compileHint(rule: BlockedCommandHintRule): CompiledBlockedCommandHint | null {
  const regex = rule.whenNotMatching ? compileRegex(rule.whenNotMatching) : undefined;
  if (rule.whenNotMatching && !regex) return null;
  return { ...rule, whenNotMatchingRegex: regex ?? undefined };
}

function applyConfig(target: MergedPermissionsConfig, config: PermissionsCustomConfig): void {
  for (const entry of config.allowedBashPatterns) {
    const regex = compileRegex(entry.pattern);
    if (regex) target.readOnlyBashPatterns.push({ regex, source: entry.pattern, comment: entry.comment });
  }
  for (const pattern of config.allowedMcpPatterns) {
    const regex = compileRegex(pattern);
    if (regex) target.readOnlyMcpPatterns.push(regex);
  }
  for (const rule of config.allowedApiEndpoints) {
    const pathPattern = compileRegex(rule.path);
    if (pathPattern) target.allowedApiEndpoints.push({ method: rule.method, pathPattern });
  }
  target.allowedWritePaths.push(...config.allowedWritePaths);
  for (const hint of config.blockedCommandHints) {
    const compiled = compileHint(hint);
    if (compiled) target.blockedCommandHints.push(compiled);
  }
}

function applySourceConfig(
  target: MergedPermissionsConfig,
  config: PermissionsCustomConfig,
  sourceSlug: string,
): void {
  const withoutMcp = { ...config, allowedMcpPatterns: [] };
  applyConfig(target, withoutMcp);
  for (const pattern of config.allowedMcpPatterns) {
    const regex = compileRegex(`mcp__${sourceSlug}__.*${pattern}`);
    if (regex) target.readOnlyMcpPatterns.push(regex);
  }
}

class PermissionsConfigCache {
  private merged = new Map<string, MergedPermissionsConfig>();

  getMergedConfig(context: PermissionsContext): MergedPermissionsConfig {
    const activeSources = [...(context.activeSourceSlugs ?? [])].sort();
    const cacheKey = `${context.workspaceRootPath}::${activeSources.join(',')}`;
    const cached = this.merged.get(cacheKey);
    if (cached) return cached;
    const result: MergedPermissionsConfig = {
      blockedTools: new Set(SAFE_MODE_CONFIG.blockedTools),
      readOnlyBashPatterns: [...SAFE_MODE_CONFIG.readOnlyBashPatterns],
      blockedCommandHints: [...(SAFE_MODE_CONFIG.blockedCommandHints ?? [])],
      readOnlyMcpPatterns: [...(SAFE_MODE_CONFIG.readOnlyMcpPatterns ?? [])],
      allowedApiEndpoints: [...(SAFE_MODE_CONFIG.allowedApiEndpoints ?? [])],
      allowedWritePaths: [],
      displayName: SAFE_MODE_CONFIG.displayName,
      shortcutHint: SAFE_MODE_CONFIG.shortcutHint,
      permissionPaths: {
        workspacePath: getWorkspacePermissionsPath(context.workspaceRootPath),
        appDefaultPath: join(getAppPermissionsDir(), 'default.json'),
        docsPath: join(CONFIG_DIR, 'docs', 'permissions.md'),
      },
    };
    const defaults = loadDefaultPermissions();
    const workspace = loadWorkspacePermissionsConfig(context.workspaceRootPath);
    if (defaults) applyConfig(result, defaults);
    if (workspace) applyConfig(result, workspace);
    for (const sourceSlug of activeSources) {
      const source = loadSourcePermissionsConfig(context.workspaceRootPath, sourceSlug);
      if (source) applySourceConfig(result, source, sourceSlug);
    }
    this.merged.set(cacheKey, result);
    return result;
  }

  invalidateDefaults(): void {
    this.merged.clear();
  }

  invalidateWorkspace(workspaceRootPath: string): void {
    for (const key of this.merged.keys()) {
      if (key.startsWith(`${workspaceRootPath}::`)) this.merged.delete(key);
    }
  }

  invalidateSource(workspaceRootPath: string, _sourceSlug: string): void {
    this.invalidateWorkspace(workspaceRootPath);
  }

  clear(): void {
    this.merged.clear();
  }
}

export const permissionsConfigCache = new PermissionsConfigCache();
