import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { PermissionsConfigSchema } from '../agent/mode-types.ts';
import {
  getAppPermissionsDir,
  getWorkspacePermissionsPath,
} from '../agent/permissions-config.ts';
import { getWorkspaceSourcesPath } from '../workspaces/storage.ts';
import { EntityColorSchema } from '../colors/validate.ts';
import { CONFIG_DIR } from './paths.ts';

export interface ValidationIssue {
  file: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const WorkspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  createdAt: z.number(),
}).passthrough();

export const StoredConfigSchema = z.object({
  workspaces: z.array(WorkspaceSchema),
  activeWorkspaceId: z.string().nullable(),
  activeSessionId: z.string().nullable(),
  llmConnections: z.array(z.object({ slug: z.string(), name: z.string() }).passthrough()).optional(),
  defaultLlmConnection: z.string().optional(),
  networkProxy: z.object({
    enabled: z.boolean(),
    httpProxy: z.string().optional(),
    httpsProxy: z.string().optional(),
    noProxy: z.string().optional(),
  }).optional(),
}).passthrough();

export const UserPreferencesSchema = z.object({
  name: z.string().optional(),
  timezone: z.string().optional(),
  location: z.object({
    city: z.string().optional(),
    region: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  notes: z.string().optional(),
  includeCoAuthoredBy: z.boolean().optional(),
  uiLanguage: z.enum(['en', 'zh-Hans']).optional(),
  updatedAt: z.number().optional(),
}).passthrough();

function issue(file: string, message: string, path = ''): ValidationIssue {
  return { file, path, message, severity: 'error' };
}

function fromZod(file: string, error: z.ZodError): ValidationResult {
  const errors = error.issues.map(item => issue(file, item.message, item.path.join('.')));
  return { valid: false, errors, warnings: [] };
}

function parseJson(content: string, file: string): { data?: unknown; result?: ValidationResult } {
  try {
    return { data: JSON.parse(content) };
  } catch (error) {
    return { result: { valid: false, errors: [issue(file, error instanceof Error ? error.message : String(error))], warnings: [] } };
  }
}

function validateFile(path: string, schema: z.ZodType): ValidationResult {
  if (!existsSync(path)) return { valid: false, errors: [issue(path, 'File not found')], warnings: [] };
  const parsed = parseJson(readFileSync(path, 'utf-8'), path);
  if (parsed.result) return parsed.result;
  const result = schema.safeParse(parsed.data);
  return result.success ? { valid: true, errors: [], warnings: [] } : fromZod(path, result.error);
}

export function validateConfig(): ValidationResult {
  return validateFile(join(CONFIG_DIR, 'config.json'), StoredConfigSchema);
}

export function validatePreferences(): ValidationResult {
  const path = join(CONFIG_DIR, 'preferences.json');
  if (!existsSync(path)) return { valid: true, errors: [], warnings: [] };
  return validateFile(path, UserPreferencesSchema);
}

function merge(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap(result => result.errors);
  const warnings = results.flatMap(result => result.warnings);
  return { valid: errors.length === 0, errors, warnings };
}

const SourceTypeSchema = z.enum(['mcp', 'api', 'local']);

const McpSourceConfigSchema = z.object({
  transport: z.enum(['http', 'sse', 'stdio']).optional(),
  url: z.string().url().optional(),
  authType: z.enum(['oauth', 'bearer', 'none']).optional(),
  clientId: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  headerNames: z.array(z.string()).optional(),
}).refine(
  data => data.transport === 'stdio'
    ? Boolean(data.command)
    : Boolean(data.url && data.authType),
  {
    message: 'MCP config requires either (url + authType) for HTTP/SSE or (command) for stdio transport',
  }
);

const ApiOAuthConfigSchema = z.object({
  authorizationUrl: z.string().url(),
  tokenUrl: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  audience: z.string().optional(),
  extraParams: z.record(z.string(), z.string()).optional(),
});

const ApiSourceConfigSchema = z.object({
  baseUrl: z.string().url(),
  authType: z.enum(['bearer', 'header', 'query', 'basic', 'oauth', 'none']),
  headerName: z.string().optional(),
  headerNames: z.array(z.string()).optional(),
  queryParam: z.string().optional(),
  authScheme: z.string().optional(),
  defaultHeaders: z.record(z.string(), z.string()).optional(),
  testEndpoint: z.object({
    method: z.enum(['GET', 'POST']),
    path: z.string(),
    body: z.record(z.string(), z.unknown()).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }).optional(),
  googleService: z.enum(['gmail', 'calendar', 'drive', 'docs', 'sheets', 'youtube', 'searchconsole']).optional(),
  googleScopes: z.array(z.string()).optional(),
  googleOAuthClientId: z.string().optional(),
  googleOAuthClientSecret: z.string().optional(),
  slackService: z.enum(['messaging', 'channels', 'users', 'files', 'full']).optional(),
  slackUserScopes: z.array(z.string()).optional(),
  microsoftService: z.enum(['outlook', 'microsoft-calendar', 'onedrive', 'teams', 'sharepoint']).optional(),
  microsoftScopes: z.array(z.string()).optional(),
  oauth: ApiOAuthConfigSchema.optional(),
});

const LocalSourceConfigSchema = z.object({
  path: z.string().min(1),
  format: z.string().optional(),
});

export const FolderSourceConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  enabled: z.boolean(),
  provider: z.string().min(1),
  type: SourceTypeSchema,
  mcp: McpSourceConfigSchema.optional(),
  api: ApiSourceConfigSchema.optional(),
  local: LocalSourceConfigSchema.optional(),
  brand: z.object({ color: EntityColorSchema.optional() }).optional(),
  icon: z.string().optional(),
  isAuthenticated: z.boolean().optional(),
  connectionStatus: z.enum(['connected', 'needs_auth', 'failed', 'untested', 'local_disabled']).optional(),
  connectionError: z.string().optional(),
  lastTestedAt: z.number().int().min(0).optional(),
  createdAt: z.number().int().min(0).optional(),
  updatedAt: z.number().int().min(0).optional(),
}).refine(data => {
  switch (data.type) {
    case 'mcp': return Boolean(data.mcp);
    case 'api': return Boolean(data.api);
    case 'local': return Boolean(data.local);
  }
}, { message: 'Config must include type-specific configuration (mcp, api, or local)' });

export function validateSourceConfig(config: unknown): ValidationResult {
  const result = FolderSourceConfigSchema.safeParse(config);
  return result.success
    ? { valid: true, errors: [], warnings: [] }
    : fromZod('config.json', result.error);
}

export function validateSourceConfigContent(jsonString: string): ValidationResult {
  const parsed = parseJson(jsonString, 'config.json');
  if (parsed.result) return parsed.result;
  return validateSourceConfig(parsed.data);
}

export function validateSource(workspaceRoot: string, slug: string): ValidationResult {
  const sourceDir = join(getWorkspaceSourcesPath(workspaceRoot), slug);
  const configPath = join(sourceDir, 'config.json');
  if (!existsSync(sourceDir)) {
    return { valid: false, errors: [issue(`sources/${slug}/config.json`, `Source folder '${slug}' does not exist`)], warnings: [] };
  }
  if (!existsSync(configPath)) {
    return { valid: false, errors: [issue(`sources/${slug}/config.json`, 'config.json not found')], warnings: [] };
  }
  const result = validateSourceConfigContent(readFileSync(configPath, 'utf-8'));
  const guidePath = join(sourceDir, 'guide.md');
  if (!existsSync(guidePath)) {
    result.warnings.push({
      file: `sources/${slug}/guide.md`,
      path: '',
      message: 'guide.md not found (recommended for usage guidelines)',
      severity: 'warning',
    });
  }
  return result;
}

export function validateAllSources(workspaceRoot: string): ValidationResult {
  const sourcesDir = getWorkspaceSourcesPath(workspaceRoot);
  if (!existsSync(sourcesDir)) return { valid: true, errors: [], warnings: [] };
  return merge(...readdirSync(sourcesDir)
    .filter(entry => statSync(join(sourcesDir, entry)).isDirectory())
    .map(slug => validateSource(workspaceRoot, slug)));
}

export const SkillMetadataSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  globs: z.array(z.string()).optional(),
  alwaysAllow: z.array(z.string()).optional(),
  icon: z.string().optional(),
}).passthrough();

export function validateSkillContent(markdownContent: string, slug: string): ValidationResult {
  const errors: ValidationIssue[] = [];
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    errors.push(issue('SKILL.md', 'Skill slug must use lowercase letters, numbers, and hyphens', 'slug'));
  }
  try {
    const parsed = matter(markdownContent);
    const metadata = SkillMetadataSchema.safeParse(parsed.data);
    if (!metadata.success) errors.push(...fromZod('SKILL.md', metadata.error).errors);
    if (!parsed.content.trim()) errors.push(issue('SKILL.md', 'Skill instructions are empty', 'content'));
  } catch (error) {
    errors.push(issue('SKILL.md', error instanceof Error ? error.message : String(error), 'frontmatter'));
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateSkill(workspaceRoot: string, slug: string): ValidationResult {
  const path = join(workspaceRoot, 'skills', slug, 'SKILL.md');
  if (!existsSync(path)) return { valid: false, errors: [issue(path, 'SKILL.md not found')], warnings: [] };
  return validateSkillContent(readFileSync(path, 'utf-8'), slug);
}

export function validateAllSkills(workspaceRoot: string): ValidationResult {
  const root = join(workspaceRoot, 'skills');
  if (!existsSync(root)) return { valid: true, errors: [], warnings: [] };
  return merge(...readdirSync(root).filter(entry => statSync(join(root, entry)).isDirectory()).map(slug => validateSkill(workspaceRoot, slug)));
}

function validateRegexes(config: z.infer<typeof PermissionsConfigSchema>, file: string): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const values = [...(config.allowedBashPatterns ?? []), ...(config.allowedWritePaths ?? [])];
  for (const [index, value] of values.entries()) {
    const pattern = typeof value === 'string' ? value : value.pattern;
    try { new RegExp(pattern); } catch (error) {
      errors.push(issue(file, `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`, String(index)));
    }
  }
  return errors;
}

export function validatePermissionsContent(jsonString: string, displayFile = 'permissions.json'): ValidationResult {
  const parsed = parseJson(jsonString, displayFile);
  if (parsed.result) return parsed.result;
  const result = PermissionsConfigSchema.safeParse(parsed.data);
  if (!result.success) return fromZod(displayFile, result.error);
  const errors = validateRegexes(result.data, displayFile);
  return { valid: errors.length === 0, errors, warnings: [] };
}

function validatePermissionsFile(path: string): ValidationResult {
  if (!existsSync(path)) return { valid: true, errors: [], warnings: [] };
  return validatePermissionsContent(readFileSync(path, 'utf-8'), path);
}

export function validateWorkspacePermissions(workspaceRoot: string): ValidationResult {
  return validatePermissionsFile(getWorkspacePermissionsPath(workspaceRoot));
}

export function validateDefaultPermissions(): ValidationResult {
  return validatePermissionsFile(join(getAppPermissionsDir(), 'default.json'));
}

export function validateAllPermissions(workspaceRoot: string): ValidationResult {
  return merge(validateDefaultPermissions(), validateWorkspacePermissions(workspaceRoot));
}

export function isValidPermissionsFile(filePath: string): boolean {
  return validatePermissionsFile(filePath).valid;
}

const ColorSchema = z.string().regex(/^(#[0-9a-fA-F]{3,8}|[a-zA-Z][a-zA-Z0-9-]*)$/);
export const ThemeOverrideSchema = z.object({
  light: z.record(z.string(), ColorSchema).optional(),
  dark: z.record(z.string(), ColorSchema).optional(),
}).passthrough();
export const PresetThemeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  light: z.record(z.string(), ColorSchema).optional(),
  dark: z.record(z.string(), ColorSchema).optional(),
}).passthrough();

function validateTheme(jsonString: string, file: string, schema: z.ZodType): ValidationResult {
  const parsed = parseJson(jsonString, file);
  if (parsed.result) return parsed.result;
  const result = schema.safeParse(parsed.data);
  return result.success ? { valid: true, errors: [], warnings: [] } : fromZod(file, result.error);
}

export function validateThemeContent(jsonString: string, displayFile = 'theme.json'): ValidationResult {
  return validateTheme(jsonString, displayFile, PresetThemeSchema);
}
export function validateThemeOverrideContent(jsonString: string, displayFile = 'theme.json'): ValidationResult {
  return validateTheme(jsonString, displayFile, ThemeOverrideSchema);
}
export function isValidThemeFile(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  return validateThemeContent(readFileSync(filePath, 'utf-8'), filePath).valid;
}

const ToolIconsSchema = z.object({ version: z.union([z.string(), z.number()]), tools: z.record(z.string(), z.unknown()) }).passthrough();
export function validateToolIconsContent(jsonString: string): ValidationResult {
  return validateTheme(jsonString, 'tool-icons.json', ToolIconsSchema);
}
export function validateToolIcons(): ValidationResult {
  const path = join(CONFIG_DIR, 'tool-icons', 'tool-icons.json');
  return existsSync(path) ? validateToolIconsContent(readFileSync(path, 'utf-8')) : { valid: true, errors: [], warnings: [] };
}

export function validateAll(_workspaceId?: string, workspaceRoot?: string): ValidationResult {
  return merge(
    validateConfig(),
    validatePreferences(),
    workspaceRoot ? validateAllSources(workspaceRoot) : { valid: true, errors: [], warnings: [] },
    workspaceRoot ? validateAllSkills(workspaceRoot) : { valid: true, errors: [], warnings: [] },
    workspaceRoot ? validateAllPermissions(workspaceRoot) : validateDefaultPermissions(),
    validateToolIcons()
  );
}

export function formatValidationResult(result: ValidationResult): string {
  const lines = [result.valid ? '✓ Validation passed' : '✗ Validation failed'];
  for (const error of result.errors) lines.push(`- ${error.file}${error.path ? `:${error.path}` : ''}: ${error.message}`);
  for (const warning of result.warnings) lines.push(`- Warning ${warning.file}: ${warning.message}`);
  return lines.join('\n');
}

export interface ConfigFileDetection {
  type: 'config' | 'preferences' | 'permissions' | 'source' | 'skill' | 'theme' | 'tool-icons';
  path: string;
  slug?: string;
  /** Workspace-relative display path used in validation errors. */
  displayFile?: string;
}

export function detectConfigFileType(filePath: string, workspaceRootPath: string): ConfigFileDetection | null {
  const absolute = resolve(filePath);
  const workspace = resolve(workspaceRootPath);
  if (absolute === join(workspace, 'permissions.json')) return { type: 'permissions', path: absolute, displayFile: 'permissions.json' };
  const sourcePath = relative(join(workspace, 'sources'), absolute).replaceAll('\\', '/');
  const sourceMatch = sourcePath.match(/^([^/]+)\/config\.json$/);
  if (sourceMatch?.[1]) return { type: 'source', path: absolute, slug: sourceMatch[1], displayFile: `sources/${sourceMatch[1]}/config.json` };
  const sourcePermissionsMatch = sourcePath.match(/^([^/]+)\/permissions\.json$/);
  if (sourcePermissionsMatch?.[1]) return { type: 'permissions', path: absolute, slug: sourcePermissionsMatch[1], displayFile: `sources/${sourcePermissionsMatch[1]}/permissions.json` };
  const skillPath = relative(join(workspace, 'skills'), absolute).replaceAll('\\', '/');
  const match = skillPath.match(/^([^/]+)\/SKILL\.md$/);
  return match?.[1] ? { type: 'skill', path: absolute, slug: match[1], displayFile: `skills/${match[1]}/SKILL.md` } : null;
}

export function detectAppConfigFileType(filePath: string): ConfigFileDetection | null {
  const absolute = resolve(filePath);
  if (absolute === join(CONFIG_DIR, 'config.json')) return { type: 'config', path: absolute };
  if (absolute === join(CONFIG_DIR, 'preferences.json')) return { type: 'preferences', path: absolute };
  if (absolute === join(CONFIG_DIR, 'theme.json')) return { type: 'theme', path: absolute };
  if (basename(absolute) === 'tool-icons.json') return { type: 'tool-icons', path: absolute };
  return null;
}

export function validateConfigFileContent(
  detection: ConfigFileDetection,
  content: string,
  workspaceRootPath?: string
): ValidationResult {
  switch (detection.type) {
    case 'config': return validateTheme(content, detection.path, StoredConfigSchema);
    case 'preferences': return validateTheme(content, detection.path, UserPreferencesSchema);
    case 'permissions': return validatePermissionsContent(content, detection.path);
    case 'source': return validateSourceConfigContent(content);
    case 'skill': return validateSkillContent(content, detection.slug ?? 'skill');
    case 'theme': return validateThemeOverrideContent(content, detection.path);
    case 'tool-icons': return validateToolIconsContent(content);
  }
}
