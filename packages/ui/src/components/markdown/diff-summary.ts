/**
 * Pure helpers for the diff well (MarkdownDiffBlock): the header summary and the height to
 * reserve before @pierre/diffs paints asynchronously.
 */

const FILE_HEADER = /^(?:\+\+\+|---)[ \t]+(?:[ab]\/)?([^\t\r\n]+)/
const GIT_HEADER = /^diff --git [ab]\/(\S+) [ab]\/(\S+)/

/**
 * File path and +/− counts for the well header, read from the patch itself: the new path
 * (else the old one, else the git header), and the change lines after the first hunk.
 */
export function summarizePatch(raw: string): { path?: string; additions: number; deletions: number } {
  let newPath: string | undefined
  let oldPath: string | undefined
  let gitPath: string | undefined
  let additions = 0
  let deletions = 0
  let inHunk = false
  for (const line of raw.split('\n')) {
    if (line.startsWith('@@')) {
      inHunk = true
      continue
    }
    if (!inHunk) {
      const git = GIT_HEADER.exec(line)
      if (git) gitPath = git[2]
      const header = FILE_HEADER.exec(line)
      if (header && header[1] !== '/dev/null') {
        if (line.startsWith('+++')) newPath = header[1]
        else oldPath = header[1]
      }
      continue
    }
    if (line.startsWith('+')) additions++
    else if (line.startsWith('-')) deletions++
  }
  if (!inHunk) {
    // Bare diff body without hunks: count the change lines directly
    for (const line of raw.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++
      else if (line.startsWith('-') && !line.startsWith('---')) deletions++
    }
  }
  return { path: newPath ?? oldPath ?? gitPath, additions, deletions }
}

/**
 * Rows PatchDiff draws: one per context/added/removed line after the first hunk header. It skips
 * hunk lines without a ' ', '+' or '-' prefix (blank lines whose leading space was stripped, prose
 * in model-written diffs), so those must not reserve height either.
 */
export function countDiffRows(patch: string): number {
  let rows = 0
  let inHunk = false
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      inHunk = true
      continue
    }
    if (inHunk && /^[ +-]/.test(line)) rows++
  }
  return rows
}
