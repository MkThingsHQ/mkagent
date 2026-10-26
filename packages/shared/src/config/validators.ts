import { isParseableColor } from './theme-roles.ts'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { PermissionsConfigSchema } from '../agent/mode-types.ts';
import {
  getAppPermissionsDir,
  getWorkspacePermissionsPath,
} from '../agent/permissions-config.ts';
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

export const CustomEndpointSchema = z.object({
  api: z.enum(['openai-completions', 'anthropic-messages']),
  supportsImages: z.boolean().optional(),
  maxTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
});

export const StoredConfigSchema = z.object({
  workspaces: z.array(WorkspaceSchema),
  activeWorkspaceId: z.string().nullable(),
  activeSessionId: z.string().nullable(),
  llmConnections: z.array(z.object({ slug: z.string(), name: z.string(), customEndpoint: CustomEndpointSchema.optional() }).passthrough()).optional(),
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
  defaultZoomLevel: z.number().positive().optional(),
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

const CSSColorSchema = z.string().min(1);

const ThemeDarkOverrideSchema = z.object({
  background: CSSColorSchema.optional(),
  foreground: CSSColorSchema.optional(),
  accent: CSSColorSchema.optional(),
  info: CSSColorSchema.optional(),
  success: CSSColorSchema.optional(),
  destructive: CSSColorSchema.optional(),
  paper: CSSColorSchema.optional(),
  navigator: CSSColorSchema.optional(),
  input: CSSColorSchema.optional(),
  popover: CSSColorSchema.optional(),
  popoverSolid: CSSColorSchema.optional(),
}).strict();

/**
 * Zod schema for app-level theme override files (~/.craft-agent/theme.json).
 * Allows partial overrides but rejects unknown keys.
 */
export const ThemeOverrideSchema = z.object({
  // Semantic colors
  background: CSSColorSchema.optional(),
  foreground: CSSColorSchema.optional(),
  accent: CSSColorSchema.optional(),
  info: CSSColorSchema.optional(),
  success: CSSColorSchema.optional(),
  destructive: CSSColorSchema.optional(),
  // Surface colors
  paper: CSSColorSchema.optional(),
  navigator: CSSColorSchema.optional(),
  input: CSSColorSchema.optional(),
  popover: CSSColorSchema.optional(),
  popoverSolid: CSSColorSchema.optional(),
  // Scenic mode
  mode: z.enum(['solid', 'scenic']).optional(),
  backgroundImage: z.string().optional(),
  // Dark mode overrides
  dark: ThemeDarkOverrideSchema.optional(),
}).strict()
  .refine(
    (data) => {
      const keys = Object.keys(data);
      return keys.length > 0;
    },
    { message: 'Theme override must include at least one supported field' }
  )
  .refine(
    (data) => data.mode !== 'scenic' || Boolean(data.backgroundImage),
    { message: 'backgroundImage is required when mode is scenic', path: ['backgroundImage'] }
  );

/**
 * Zod schema for preset theme files.
 * Validates theme structure and requires at least one color property.
 */
export const PresetThemeSchema = z.object({
  name: z.string().min(1, 'Theme name is required'),
  description: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
  source: z.string().optional(),
  supportedModes: z.array(z.enum(['light', 'dark'])).optional(),
  // Semantic colors
  background: CSSColorSchema.optional(),
  foreground: CSSColorSchema.optional(),
  accent: CSSColorSchema.optional(),
  info: CSSColorSchema.optional(),
  success: CSSColorSchema.optional(),
  destructive: CSSColorSchema.optional(),
  // Surface colors
  paper: CSSColorSchema.optional(),
  navigator: CSSColorSchema.optional(),
  input: CSSColorSchema.optional(),
  popover: CSSColorSchema.optional(),
  popoverSolid: CSSColorSchema.optional(),
  // Scenic mode
  mode: z.enum(['solid', 'scenic']).optional(),
  backgroundImage: z.string().optional(),
  // Dark mode overrides
  dark: z.object({}).passthrough().optional(),
  // Shiki theme for syntax highlighting
  shikiTheme: z.object({
    light: z.string().optional(),
    dark: z.string().optional(),
  }).optional(),
}).refine(
  (data) => {
    const colorProps = ['background', 'foreground', 'accent', 'info', 'success', 'destructive'];
    return colorProps.some(prop => prop in data);
  },
  { message: 'Theme must have at least one color property (background, foreground, accent, info, success, or destructive)' }
);

/**
 * Warn about theme colors the role solver can't parse (e.g. `var(--x)`, `lab()`, typos). They are not
 * errors — the app falls back to the default theme's color for that key — but users should know.
 */
function collectThemeColorWarnings(content: unknown, displayFile: string): ValidationIssue[] {
  if (!content || typeof content !== 'object') return [];
  const keys = ['background', 'foreground', 'accent', 'info', 'success', 'destructive', 'paper', 'navigator', 'input', 'popover', 'popoverSolid'];
  const warnings: ValidationIssue[] = [];
  const check = (obj: Record<string, unknown>, prefix: string) => {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value !== 'string' || isParseableColor(value)) continue;
      warnings.push({
        file: displayFile,
        path: prefix + key,
        message: `"${value}" is not a supported CSS color; the default theme's color is used instead`,
        severity: 'warning',
        suggestion: 'Use hex, rgb(), hsl(), oklch(), oklab() or a CSS color name',
      });
    }
  };
  const record = content as Record<string, unknown>;
  check(record, '');
  if (record.dark && typeof record.dark === 'object') check(record.dark as Record<string, unknown>, 'dark.');
  return warnings;
}

/**
 * Validate theme content from a JSON string (no disk reads).
 * Used to check if an existing theme file is valid before deciding to overwrite.
 */
export function validateThemeContent(jsonString: string, displayFile: string = 'theme.json'): ValidationResult {
  const errors: ValidationIssue[] = [];

  // Parse JSON
  let content: unknown;
  try {
    content = JSON.parse(jsonString);
  } catch (e) {
    return {
      valid: false,
      errors: [{
        file: displayFile,
        path: '',
        message: `Invalid JSON: ${e instanceof Error ? e.message : 'Unknown error'}`,
        severity: 'error',
      }],
      warnings: [],
    };
  }

  // Validate schema
  const result = PresetThemeSchema.safeParse(content);
  if (!result.success) {
    errors.push(...fromZod(displayFile, result.error).errors);
    return { valid: false, errors, warnings: [] };
  }

  return {
    valid: true,
    errors: [],
    warnings: collectThemeColorWarnings(content, displayFile),
  };
}

/**
 * Validate app-level theme override content from a JSON string (no disk reads).
 * Unlike preset validation, this accepts partial ThemeOverrides objects and rejects unknown keys.
 */
export function validateThemeOverrideContent(jsonString: string, displayFile: string = 'theme.json'): ValidationResult {
  const errors: ValidationIssue[] = [];

  // Parse JSON
  let content: unknown;
  try {
    content = JSON.parse(jsonString);
  } catch (e) {
    return {
      valid: false,
      errors: [{
        file: displayFile,
        path: '',
        message: `Invalid JSON: ${e instanceof Error ? e.message : 'Unknown error'}`,
        severity: 'error',
      }],
      warnings: [],
    };
  }

  // Validate schema
  const result = ThemeOverrideSchema.safeParse(content);
  if (!result.success) {
    errors.push(...fromZod(displayFile, result.error).errors);
    return { valid: false, errors, warnings: [] };
  }

  return {
    valid: true,
    errors: [],
    warnings: collectThemeColorWarnings(content, displayFile),
  };
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
  type: 'config' | 'preferences' | 'permissions' | 'skill' | 'theme' | 'tool-icons';
  path: string;
  slug?: string;
}

export function detectConfigFileType(filePath: string, workspaceRootPath: string): ConfigFileDetection | null {
  const absolute = resolve(filePath);
  const workspace = resolve(workspaceRootPath);
  if (absolute === join(workspace, 'permissions.json')) return { type: 'permissions', path: absolute };
  const skillPath = relative(join(workspace, 'skills'), absolute).replaceAll('\\', '/');
  const match = skillPath.match(/^([^/]+)\/SKILL\.md$/);
  return match?.[1] ? { type: 'skill', path: absolute, slug: match[1] } : null;
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
    case 'skill': return validateSkillContent(content, detection.slug ?? 'skill');
    case 'theme': return validateThemeOverrideContent(content, detection.path);
    case 'tool-icons': return validateToolIconsContent(content);
  }
}

function validateTheme(jsonString: string, file: string, schema: z.ZodType): ValidationResult {
  const parsed = parseJson(jsonString, file);
  if (parsed.result) return parsed.result;
  const result = schema.safeParse(parsed.data);
  return result.success ? { valid: true, errors: [], warnings: [] } : fromZod(file, result.error);
}
