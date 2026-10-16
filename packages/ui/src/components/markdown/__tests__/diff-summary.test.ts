import { describe, expect, it } from 'bun:test'
import { getSingularPatch } from '@pierre/diffs'
import { ensureUnifiedDiffFormat } from '../diff-normalize'
import { countDiffRows, summarizePatch } from '../diff-summary'

const clean = [
  '--- a/src/app/main.ts',
  '+++ b/src/app/main.ts',
  '@@ -1,3 +1,4 @@',
  ' const a = 1',
  '-const b = 2',
  '+const b = 3',
  '+const c = 4',
  ' export { a }',
  '',
].join('\n')

// Model-written diffs often drop the leading space of blank context lines.
const blankLinesStripped = [
  '--- a/src/app/main.ts',
  '+++ b/src/app/main.ts',
  '@@ -1,5 +1,6 @@',
  ' const a = 1',
  '',
  '-const b = 2',
  '+const b = 3',
  '',
  '+const c = 4',
  ' export { a }',
].join('\n')

/** Rows @pierre/diffs renders, from its own parser (it logs the skipped lines; silence that here). */
function pierreRows(patch: string): number {
  const original = console.error
  console.error = () => {}
  try {
    return (getSingularPatch(patch) as unknown as { unifiedLineCount: number }).unifiedLineCount
  } finally {
    console.error = original
  }
}

describe('countDiffRows', () => {
  it('matches the rows @pierre/diffs renders for a clean patch', () => {
    expect(countDiffRows(clean)).toBe(5)
    expect(countDiffRows(clean)).toBe(pierreRows(clean))
  })

  it('does not reserve rows for unprefixed lines the renderer skips', () => {
    expect(countDiffRows(blankLinesStripped)).toBe(pierreRows(blankLinesStripped))
    expect(countDiffRows(blankLinesStripped)).toBe(5)
  })

  it('matches the renderer for a bare body normalised into a hunk', () => {
    const patch = ensureUnifiedDiffFormat(['-old line', '+new line', 'unprefixed prose', ' kept'].join('\n'))
    expect(countDiffRows(patch)).toBe(pierreRows(patch))
  })
})

describe('summarizePatch', () => {
  it('reads the new path and the change counts', () => {
    expect(summarizePatch(clean)).toEqual({ path: 'src/app/main.ts', additions: 2, deletions: 1 })
  })
})
