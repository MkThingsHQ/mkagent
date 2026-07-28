/**
 * Mention Parsing Utilities
 *
 * Pure string-parsing functions for [bracket] mentions in chat messages.
 * No renderer/browser dependencies — safe to use in any context.
 *
 * Mention types:
 * - Skills:  [skill:slug] or [skill:workspaceId:slug]
 * - Files:   [file:path]
 * - Folders: [folder:path]
 */

// Simple path join that works in both Node and browser contexts.
// Cannot use node:path here — this module is imported by the Vite renderer.
function joinPath(base: string, relative: string): string {
  const sep = base.includes('\\') ? '\\' : '/'
  return base.endsWith(sep) ? base + relative : base + sep + relative
}

// ============================================================================
// Constants
// ============================================================================

// Workspace ID character class for regex: word chars, spaces (NOT newlines), hyphens, dots
// Using literal space instead of \s to avoid matching newlines which would break parsing
export const WS_ID_CHARS = '[\\w .-]'

// ============================================================================
// Types
// ============================================================================

export interface ParsedMentions {
  /** Skill slugs mentioned via [skill:slug] */
  skills: string[]
  /** Invalid skill slugs mentioned but not found in availableSkillSlugs */
  invalidSkills: string[]
  /** File paths mentioned via [file:path] */
  files: string[]
  /** Folder paths mentioned via [folder:path] */
  folders: string[]
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse all mentions from message text
 *
 * @param text - The message text to parse
 * @param availableSkillSlugs - Valid skill slugs to match against
 * @returns Parsed mentions by type
 *
 * @example
 * parseMentions('[skill:commit]', ['commit'])
 * // Returns: { skills: ['commit'] }
 */
export function parseMentions(
  text: string,
  availableSkillSlugs: string[]
): ParsedMentions {
  const result: ParsedMentions = {
    skills: [],
    invalidSkills: [],
    files: [],
    folders: [],
  }

  let match: RegExpExecArray | null

  // Match skill mentions: [skill:slug] or [skill:workspaceId:slug]
  // The pattern captures the last component (slug) after any number of colons
  // Workspace IDs can contain spaces, hyphens, underscores, and dots
  const skillPattern = new RegExp(`\\[skill:(?:${WS_ID_CHARS}+:)?([\\w-]+)\\]`, 'g')
  while ((match = skillPattern.exec(text)) !== null) {
    const slug = match[1]!
    if (availableSkillSlugs.includes(slug)) {
      if (!result.skills.includes(slug)) {
        result.skills.push(slug)
      }
    } else {
      if (!result.invalidSkills.includes(slug)) {
        result.invalidSkills.push(slug)
      }
    }
  }

  // Match file mentions: [file:path] (path can contain any chars except ])
  const filePattern = /\[file:([^\]]+)\]/g
  while ((match = filePattern.exec(text)) !== null) {
    const filePath = match[1]!
    if (!result.files.includes(filePath)) {
      result.files.push(filePath)
    }
  }

  // Match folder mentions: [folder:path]
  const folderPattern = /\[folder:([^\]]+)\]/g
  while ((match = folderPattern.exec(text)) !== null) {
    const folderPath = match[1]!
    if (!result.folders.includes(folderPath)) {
      result.folders.push(folderPath)
    }
  }

  return result
}

/**
 * Strip skill mentions from text, replacing them with their slug.
 *
 * @param text - The message text with mentions
 * @returns Text with skill mentions replaced by their slug
 *
 * @deprecated Prefer resolveSkillMentions for richer output.
 */
export function stripAllMentions(text: string): string {
  return text
    // Replace [skill:slug] or [skill:workspaceId:slug] with just the slug
    .replace(new RegExp(`\\[skill:(?:${WS_ID_CHARS}+:)?([\\w-]+)\\]`, 'g'), '$1')
    // Note: [file:...] and [folder:...] are NOT stripped — they are content
    // that gets resolved to absolute paths by resolveFileMentions().
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resolve skill mentions to semantic markers with display names.
 *
 * [skill:datadog-api]           → [Mentioned skill: Datadog API (slug: datadog-api)]
 * [skill:My Workspace:commit]   → [Mentioned skill: Git Commit (slug: commit)]
 *
 * Skills not found in the map fall back to the slug as display name.
 *
 * @param text - The message text with skill mentions
 * @param skillNames - Map of slug → display name (from loaded skill metadata)
 */
export function resolveSkillMentions(
  text: string,
  skillNames: Map<string, string>
): string {
  return text.replace(
    new RegExp(`\\[skill:(?:${WS_ID_CHARS}+:)?([\\w-]+)\\]`, 'g'),
    (_match, slug: string) => {
      const name = skillNames.get(slug) || slug
      return `[Mentioned skill: ${name} (slug: ${slug})]`
    }
  )
}

/**
 * Resolve file and folder mentions to semantic markers with absolute paths.
 *
 * [file:src/index.ts]       → [Mentioned file: index.ts (at /Users/me/project/src/index.ts)]
 * [folder:src/components]   → [Mentioned folder: components (at /Users/me/project/src/components)]
 * [file:/tmp/test.txt]      → [Mentioned file: test.txt (at /tmp/test.txt)]
 *
 * The semantic wrapper signals to the agent that the user explicitly referenced
 * this file/folder and it should be proactively read. This matches the
 * [Attached file: ...] pattern used by drag-and-drop attachments.
 *
 * Leaves skill mentions untouched.
 */
export function resolveFileMentions(text: string, workingDirectory: string): string {
  return text
    .replace(/\[file:([^\]]+)\]/g, (_match, filePath: string) => {
      const resolved = filePath.startsWith('/') || filePath.startsWith('~')
        ? filePath
        : joinPath(workingDirectory, filePath)
      const name = filePath.split('/').pop() || filePath
      return `[Mentioned file: ${name} (at ${resolved})]`
    })
    .replace(/\[folder:([^\]]+)\]/g, (_match, folderPath: string) => {
      const resolved = folderPath.startsWith('/') || folderPath.startsWith('~')
        ? folderPath
        : joinPath(workingDirectory, folderPath)
      const name = folderPath.split('/').pop() || folderPath
      return `[Mentioned folder: ${name} (at ${resolved})]`
    })
}
