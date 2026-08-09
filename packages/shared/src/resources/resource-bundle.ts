/**
 * Resource Bundle — Export/Import Logic
 *
 * Exports workspace resources (sources and skills) to a portable
 * ResourceBundle, and imports bundles into a target workspace.
 *
 * Key behaviors:
 * - Source configs are sanitized (secrets stripped, auth state reset)
 * - All non-hidden files are included per resource (not just known file types)
 * - Import uses staging + atomic rename per resource (single watcher event)
 * - Source overwrite clears stored credentials
 * - Relies on existing ConfigWatcher for change notifications (no manual events)
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'fs'
import { join, basename } from 'path'
import { randomUUID } from 'crypto'
import {
  type BundleFile,
  MAX_BUNDLE_SIZE_BYTES,
  collectDirectoryFiles,
  restoreFiles,
  validateBundleFile,
} from '../utils/bundle-files.ts'
import { getWorkspaceSourcesPath, getWorkspaceSkillsPath } from '../workspaces/storage.ts'
import { loadSourceConfig, getSourcePath } from '../sources/storage.ts'
import { isBuiltinSource } from '../sources/builtin-sources.ts'
import { validateSourceConfig } from '../config/validators.ts'
import { debug } from '../utils/debug.ts'

import type { FolderSourceConfig } from '../sources/types.ts'
import type {
  ResourceBundle,
  SourceBundleEntry,
  SkillBundleEntry,
  ExportResourcesOptions,
  ExportResult,
  ResourceImportMode,
  ResourceImportResult,
  ImportBucketResult,
  ResourceImportDeps,
} from './types.ts'

// ============================================================
// Source Config Sanitization
// ============================================================

/**
 * Fields to strip from source configs on export.
 *
 * Runtime state fields are always removed.
 * Known secret-bearing fields are removed with warnings.
 */

/** Strip runtime auth/status state from a source config */
function sanitizeSourceConfig(config: FolderSourceConfig): { config: FolderSourceConfig; warnings: string[] } {
  const warnings: string[] = []

  // Deep clone to avoid mutating the original
  const sanitized: FolderSourceConfig = JSON.parse(JSON.stringify(config))

  // --- Runtime state: always remove ---
  sanitized.isAuthenticated = false
  delete sanitized.connectionError
  delete sanitized.lastTestedAt

  // Determine if source requires auth
  const authType = sanitized.mcp?.authType || sanitized.api?.authType
  if (authType && authType !== 'none') {
    sanitized.connectionStatus = 'needs_auth'
  } else {
    sanitized.connectionStatus = undefined
  }

  // --- Known secret fields: always remove ---
  if (sanitized.api?.googleOAuthClientSecret) {
    delete sanitized.api.googleOAuthClientSecret
    warnings.push(`Source '${config.slug}': stripped googleOAuthClientSecret`)
  }

  // --- MCP env vars: may contain tokens ---
  if (sanitized.mcp?.env && Object.keys(sanitized.mcp.env).length > 0) {
    delete sanitized.mcp.env
    warnings.push(`Source '${config.slug}': stripped mcp.env (may contain secrets)`)
  }

  // --- Headers: potentially secret, remove with warning ---
  if (sanitized.mcp?.headers && Object.keys(sanitized.mcp.headers).length > 0) {
    delete sanitized.mcp.headers
    warnings.push(`Source '${config.slug}': stripped mcp.headers (may contain auth tokens)`)
  }

  if (sanitized.api?.defaultHeaders && Object.keys(sanitized.api.defaultHeaders).length > 0) {
    delete sanitized.api.defaultHeaders
    warnings.push(`Source '${config.slug}': stripped api.defaultHeaders (may contain auth tokens)`)
  }

  return { config: sanitized, warnings }
}

// ============================================================
// Export
// ============================================================

/**
 * Export workspace resources to a portable ResourceBundle.
 *
 * @param workspaceRootPath - Absolute path to workspace root
 * @param options - Which resources to export
 * @returns Bundle + export warnings
 */
export function exportResources(
  workspaceRootPath: string,
  options: ExportResourcesOptions,
): ExportResult {
  const warnings: string[] = []
  const bundle: ResourceBundle = {
    version: 1,
    exportedAt: Date.now(),
    resources: {},
  }

  // Try to read workspace name for informational purposes
  try {
    const wsConfigPath = join(workspaceRootPath, 'config.json')
    if (existsSync(wsConfigPath)) {
      const wsConfig = JSON.parse(readFileSync(wsConfigPath, 'utf-8'))
      if (wsConfig.name) {
        bundle.sourceWorkspace = wsConfig.name
      }
    }
  } catch {
    // Non-fatal: sourceWorkspace is informational
  }

  // --- Export sources ---
  if (options.sources) {
    bundle.resources.sources = exportSources(workspaceRootPath, options.sources, warnings)
  }

  // --- Export skills ---
  if (options.skills) {
    bundle.resources.skills = exportSkills(workspaceRootPath, options.skills, warnings)
  }

  // Validate total size
  const bundleJson = JSON.stringify(bundle)
  if (Buffer.byteLength(bundleJson) > MAX_BUNDLE_SIZE_BYTES) {
    warnings.push(`Bundle exceeds ${MAX_BUNDLE_SIZE_BYTES / 1024 / 1024}MB size limit`)
  }

  return { bundle, warnings }
}

function exportSources(
  workspaceRootPath: string,
  selection: string[] | 'all',
  warnings: string[],
): SourceBundleEntry[] {
  const entries: SourceBundleEntry[] = []
  const sourcesDir = getWorkspaceSourcesPath(workspaceRootPath)

  if (!existsSync(sourcesDir)) return entries

  // Determine which slugs to export
  let slugs: string[]
  if (selection === 'all') {
    slugs = readdirSync(sourcesDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name)
  } else {
    slugs = selection
  }

  for (const slug of slugs) {
    const sourcePath = getSourcePath(workspaceRootPath, slug)
    if (!existsSync(sourcePath)) {
      warnings.push(`Source '${slug}' not found, skipping`)
      continue
    }

    const config = loadSourceConfig(workspaceRootPath, slug)
    if (!config) {
      warnings.push(`Source '${slug}' has invalid config, skipping`)
      continue
    }

    // Sanitize config
    const { config: sanitizedConfig, warnings: sanitizeWarnings } = sanitizeSourceConfig(config)
    warnings.push(...sanitizeWarnings)

    // Collect all files except config.json (which travels as structured data)
    const files = collectDirectoryFiles(sourcePath, {
      skipFiles: new Set(['config.json']),
    })

    entries.push({
      slug,
      config: sanitizedConfig,
      files,
    })
  }

  return entries
}

function exportSkills(
  workspaceRootPath: string,
  selection: string[] | 'all',
  warnings: string[],
): SkillBundleEntry[] {
  const entries: SkillBundleEntry[] = []
  const skillsDir = getWorkspaceSkillsPath(workspaceRootPath)

  if (!existsSync(skillsDir)) return entries

  // Determine which slugs to export
  let slugs: string[]
  if (selection === 'all') {
    slugs = readdirSync(skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name)
  } else {
    slugs = selection
  }

  for (const slug of slugs) {
    const skillDir = join(skillsDir, slug)
    if (!existsSync(skillDir)) {
      warnings.push(`Skill '${slug}' not found, skipping`)
      continue
    }

    // Collect all files in the skill directory
    const files = collectDirectoryFiles(skillDir)

    // Validate that SKILL.md is present
    const hasSkillMd = files.some(f => f.relativePath === 'SKILL.md')
    if (!hasSkillMd) {
      warnings.push(`Skill '${slug}' missing SKILL.md, skipping`)
      continue
    }

    entries.push({ slug, files })
  }

  return entries
}

// ============================================================
// Validation
// ============================================================

/**
 * Validate a ResourceBundle structure.
 * Returns { valid, errors } rather than a type guard, so callers get diagnostics.
 */
export function validateResourceBundle(bundle: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!bundle || typeof bundle !== 'object') {
    return { valid: false, errors: ['Bundle is not an object'] }
  }

  const b = bundle as Record<string, unknown>

  if (b.version !== 1) {
    errors.push(`Unsupported bundle version: ${b.version}`)
  }

  if (typeof b.exportedAt !== 'number') {
    errors.push('Missing or invalid exportedAt')
  }

  if (!b.resources || typeof b.resources !== 'object') {
    errors.push('Missing or invalid resources')
    return { valid: false, errors }
  }

  const res = b.resources as Record<string, unknown>

  // Validate sources
  if (res.sources !== undefined) {
    if (!Array.isArray(res.sources)) {
      errors.push('resources.sources must be an array')
    } else {
      const slugs = new Set<string>()
      for (let i = 0; i < res.sources.length; i++) {
        const entry = res.sources[i]
        const prefix = `sources[${i}]`

        if (!entry || typeof entry !== 'object') {
          errors.push(`${prefix}: not an object`)
          continue
        }

        const e = entry as Record<string, unknown>

        if (typeof e.slug !== 'string' || !e.slug) {
          errors.push(`${prefix}: missing or invalid slug`)
          continue
        }

        if (slugs.has(e.slug as string)) {
          errors.push(`${prefix}: duplicate slug '${e.slug}'`)
        }
        slugs.add(e.slug as string)

        // Check for builtin/reserved slugs
        if (isBuiltinSource(e.slug as string)) {
          errors.push(`${prefix}: '${e.slug}' is a reserved builtin source slug`)
        }

        if (!e.config || typeof e.config !== 'object') {
          errors.push(`${prefix}: missing or invalid config`)
        } else {
          const cfg = e.config as Record<string, unknown>
          if (typeof cfg.slug === 'string' && cfg.slug !== e.slug) {
            errors.push(`${prefix}: config.slug '${cfg.slug}' does not match entry slug '${e.slug}'`)
          }
        }

        if (!Array.isArray(e.files)) {
          errors.push(`${prefix}: files must be an array`)
        } else {
          validateFileEntries(e.files as BundleFile[], prefix, errors)
        }
      }
    }
  }

  // Validate skills
  if (res.skills !== undefined) {
    if (!Array.isArray(res.skills)) {
      errors.push('resources.skills must be an array')
    } else {
      const slugs = new Set<string>()
      for (let i = 0; i < res.skills.length; i++) {
        const entry = res.skills[i]
        const prefix = `skills[${i}]`

        if (!entry || typeof entry !== 'object') {
          errors.push(`${prefix}: not an object`)
          continue
        }

        const e = entry as Record<string, unknown>

        if (typeof e.slug !== 'string' || !e.slug) {
          errors.push(`${prefix}: missing or invalid slug`)
          continue
        }

        if (slugs.has(e.slug as string)) {
          errors.push(`${prefix}: duplicate slug '${e.slug}'`)
        }
        slugs.add(e.slug as string)

        if (!Array.isArray(e.files)) {
          errors.push(`${prefix}: files must be an array`)
        } else {
          // Validate SKILL.md is present
          const hasSkillMd = (e.files as BundleFile[]).some(f =>
            typeof f === 'object' && f && (f as BundleFile).relativePath === 'SKILL.md',
          )
          if (!hasSkillMd) {
            errors.push(`${prefix}: missing SKILL.md`)
          }
          validateFileEntries(e.files as BundleFile[], prefix, errors)
        }
      }
    }
  }

  // Validate total bundle size
  try {
    const size = Buffer.byteLength(JSON.stringify(bundle))
    if (size > MAX_BUNDLE_SIZE_BYTES) {
      errors.push(`Bundle size ${size} exceeds max ${MAX_BUNDLE_SIZE_BYTES}`)
    }
  } catch {
    errors.push('Bundle is not serializable')
  }

  return { valid: errors.length === 0, errors }
}

function validateFileEntries(files: BundleFile[], prefix: string, errors: string[]): void {
  const paths = new Set<string>()

  for (let j = 0; j < files.length; j++) {
    const file = files[j]
    if (!file || typeof file !== 'object') {
      errors.push(`${prefix}.files[${j}]: not an object`)
      continue
    }

    // Check for duplicate paths
    if (paths.has(file.relativePath)) {
      errors.push(`${prefix}.files[${j}]: duplicate path '${file.relativePath}'`)
    }
    paths.add(file.relativePath)

    const fileError = validateBundleFile(file)
    if (fileError) {
      errors.push(`${prefix}.files[${j}]: ${fileError}`)
    }
  }
}

// ============================================================
// Import
// ============================================================

/**
 * Import a ResourceBundle into a target workspace.
 *
 * Uses staging + atomic rename per resource to minimize watcher churn
 * and ensure true replacement on overwrite.
 *
 * @param workspaceRootPath - Absolute path to target workspace
 * @param bundle - The validated ResourceBundle to import
 * @param mode - 'skip' (keep existing) or 'overwrite' (replace)
 * @param deps - Injected dependencies for credential cleanup
 */
export async function importResources(
  workspaceRootPath: string,
  bundle: ResourceBundle,
  mode: ResourceImportMode,
  deps: ResourceImportDeps,
): Promise<ResourceImportResult> {
  // Validate bundle first
  const validation = validateResourceBundle(bundle)
  if (!validation.valid) {
    const errorMsg = `Invalid bundle: ${validation.errors.join('; ')}`
    const failedBucket = { imported: [], skipped: [], failed: [{ id: '*', error: errorMsg }], warnings: [] }
    return {
      sources: { ...failedBucket },
      skills: { ...failedBucket },
    }
  }

  const workspaceId = basename(workspaceRootPath)

  // Import each resource type
  const sourcesResult = bundle.resources.sources
    ? await importSources(workspaceRootPath, workspaceId, bundle.resources.sources, mode, deps)
    : emptyBucketResult()

  const skillsResult = bundle.resources.skills
    ? importSkills(workspaceRootPath, bundle.resources.skills, mode)
    : emptyBucketResult()


  return {
    sources: sourcesResult,
    skills: skillsResult,
  }
}

function emptyBucketResult(): ImportBucketResult {
  return { imported: [], skipped: [], failed: [], warnings: [] }
}

// ============================================================
// Import: Sources
// ============================================================

async function importSources(
  workspaceRootPath: string,
  workspaceId: string,
  entries: SourceBundleEntry[],
  mode: ResourceImportMode,
  deps: ResourceImportDeps,
): Promise<ImportBucketResult> {
  const result = emptyBucketResult()
  const sourcesDir = getWorkspaceSourcesPath(workspaceRootPath)

  if (!existsSync(sourcesDir)) {
    mkdirSync(sourcesDir, { recursive: true })
  }

  for (const entry of entries) {
    try {
      // Check for reserved slugs
      if (isBuiltinSource(entry.slug)) {
        result.failed.push({ id: entry.slug, error: 'Cannot import builtin source slug' })
        continue
      }

      const targetDir = getSourcePath(workspaceRootPath, entry.slug)
      const exists = existsSync(targetDir)

      if (exists && mode === 'skip') {
        result.skipped.push(entry.slug)
        continue
      }

      // Stage: build in temp dir
      const tmpDir = join(sourcesDir, `.tmp-${entry.slug}-${randomUUID().slice(0, 8)}`)
      mkdirSync(tmpDir, { recursive: true })

      try {
        // Write sanitized config.json
        writeFileSync(join(tmpDir, 'config.json'), JSON.stringify(entry.config, null, 2))

        // Restore all other files
        restoreFiles(tmpDir, entry.files)

        // Validate: config should load correctly
        const validation = validateSourceConfig(entry.config)
        if (!validation.valid) {
          const msgs = validation.errors.map(e => `${e.path}: ${e.message}`).join(', ')
          result.failed.push({ id: entry.slug, error: `Invalid source config: ${msgs}` })
          rmSync(tmpDir, { recursive: true })
          continue
        }

        // On overwrite: clear credentials + remove old dir
        if (exists) {
          // Clear all credential types for this slug
          try {
            await deps.clearSourceCredentials(workspaceId, entry.slug)
          } catch (err) {
            result.warnings.push(`Source '${entry.slug}': failed to clear credentials: ${err}`)
          }
          rmSync(targetDir, { recursive: true })
        }

        // Atomic replace: rename temp → target
        renameSync(tmpDir, targetDir)
        result.imported.push(entry.slug)
      } catch (err) {
        // Clean up temp dir on failure
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true })
        }
        throw err
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.failed.push({ id: entry.slug, error: message })
    }
  }

  return result
}

// ============================================================
// Import: Skills
// ============================================================

function importSkills(
  workspaceRootPath: string,
  entries: SkillBundleEntry[],
  mode: ResourceImportMode,
): ImportBucketResult {
  const result = emptyBucketResult()
  const skillsDir = getWorkspaceSkillsPath(workspaceRootPath)

  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true })
  }

  for (const entry of entries) {
    try {
      const targetDir = join(skillsDir, entry.slug)
      const exists = existsSync(targetDir)

      if (exists && mode === 'skip') {
        result.skipped.push(entry.slug)
        continue
      }

      // Stage: build in temp dir
      const tmpDir = join(skillsDir, `.tmp-${entry.slug}-${randomUUID().slice(0, 8)}`)
      mkdirSync(tmpDir, { recursive: true })

      try {
        // Restore all files
        restoreFiles(tmpDir, entry.files)

        // Validate: SKILL.md should exist
        if (!existsSync(join(tmpDir, 'SKILL.md'))) {
          result.failed.push({ id: entry.slug, error: 'SKILL.md missing after restore' })
          rmSync(tmpDir, { recursive: true })
          continue
        }

        // On overwrite: remove old dir
        if (exists) {
          rmSync(targetDir, { recursive: true })
        }

        // Atomic replace: rename temp → target
        renameSync(tmpDir, targetDir)
        result.imported.push(entry.slug)
      } catch (err) {
        // Clean up temp dir on failure
        if (existsSync(tmpDir)) {
          rmSync(tmpDir, { recursive: true })
        }
        throw err
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.failed.push({ id: entry.slug, error: message })
    }
  }

  return result
}


