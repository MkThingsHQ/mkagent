/**
 * Resource Bundle Types
 *
 * Portable format for exporting/importing workspace resources
 * (sources and skills) between workspaces.
 *
 * Follows the same bundle pattern as session export/import.
 */

import type { BundleFile } from '../utils/bundle-files.ts'
import type { FolderSourceConfig } from '../sources/types.ts'

// ============================================================
// Bundle Format
// ============================================================

/**
 * Portable representation of workspace resources.
 * JSON envelope with base64-encoded files — same pattern as SessionBundle.
 */
export interface ResourceBundle {
  /** Bundle format version */
  version: 1
  /** When the bundle was created (Unix timestamp ms) */
  exportedAt: number
  /** Informational: name of the workspace this was exported from */
  sourceWorkspace?: string
  /** The exported resources */
  resources: {
    sources?: SourceBundleEntry[]
    skills?: SkillBundleEntry[]
  }
}

/**
 * A source in the bundle.
 * Config is sanitized (no secrets, no runtime state).
 * Files include everything in the source folder EXCEPT config.json.
 */
export interface SourceBundleEntry {
  /** Source slug (folder name) */
  slug: string
  /** Sanitized source config — no credentials, auth state reset */
  config: FolderSourceConfig
  /** All non-hidden regular files except config.json (guide.md, icons, permissions, docs, etc.) */
  files: BundleFile[]
}

/**
 * A skill in the bundle.
 * Files include everything in the skill folder (SKILL.md, icons, scripts, docs, etc.).
 * No separate metadata field — derive from SKILL.md at read time if needed.
 */
export interface SkillBundleEntry {
  /** Skill slug (folder name) */
  slug: string
  /** All non-hidden regular files in the skill directory */
  files: BundleFile[]
}


// ============================================================
// Import/Export Options & Results
// ============================================================

/**
 * Global import conflict mode for v1.
 * - 'skip': Keep existing resources, don't overwrite
 * - 'overwrite': Replace existing resources with imported ones
 */
export type ResourceImportMode = 'skip' | 'overwrite'

/**
 * Options for resource export.
 */
export interface ExportResourcesOptions {
  /** Source slugs to export, or 'all' for every source */
  sources?: string[] | 'all'
  /** Skill slugs to export, or 'all' for every skill */
  skills?: string[] | 'all'
}

/**
 * Result of a resource export.
 */
export interface ExportResult {
  bundle: ResourceBundle
  /** Export-time warnings (skipped resources, stripped secrets, non-portable paths, etc.) */
  warnings: string[]
}

/**
 * Per-resource-type import result with room for partial failures.
 */
export interface ImportBucketResult {
  /** Identifiers that were successfully imported (source or skill slugs) */
  imported: string[]
  /** Identifiers that were skipped (already exist + mode='skip') */
  skipped: string[]
  /** Identifiers that failed with an error */
  failed: Array<{ id: string; error: string }>
  /** Warnings (non-fatal issues) */
  warnings: string[]
}

/**
 * Result of a resource import.
 */
export interface ResourceImportResult {
  sources: ImportBucketResult
  skills: ImportBucketResult
}

// ============================================================
// Dependency injection for import
// ============================================================

/**
 * Dependencies injected into importResources for credential cleanup.
 * This avoids the resource module depending on the credential store directly.
 */
export interface ResourceImportDeps {
  /**
   * Clear all stored credentials for a source slug in a workspace.
   * Called on source overwrite to prevent stale credential leakage.
   */
  clearSourceCredentials: (workspaceId: string, sourceSlug: string) => Promise<void>
}

