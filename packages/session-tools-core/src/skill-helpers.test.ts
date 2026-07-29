import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveSessionWorkingDirectory } from './skill-helpers.ts'

describe('resolveSessionWorkingDirectory', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('reads the header without parsing the trailing transcript', () => {
    const workspacePath = mkdtempSync(join(tmpdir(), 'mkagent-skill-helper-'))
    roots.push(workspacePath)
    const sessionDir = join(workspacePath, 'sessions', 'session-1')
    mkdirSync(sessionDir, { recursive: true })
    writeFileSync(
      join(sessionDir, 'session.jsonl'),
      `${JSON.stringify({ workingDirectory: '/tmp/project' })}\n${'not-json\n'.repeat(300_000)}`,
    )

    expect(resolveSessionWorkingDirectory(workspacePath, 'session-1')).toBe('/tmp/project')
  })
})
