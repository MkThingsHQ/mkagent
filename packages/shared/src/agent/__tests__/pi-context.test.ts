import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { handleConfigValidate } from '@mkagent/session-tools-core'
import { createPiContext } from '../pi-context.ts'

describe('createPiContext', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('uses the retained full permissions validator for config_validate', async () => {
    const workspacePath = mkdtempSync(join(tmpdir(), 'mkagent-pi-context-'))
    roots.push(workspacePath)
    writeFileSync(
      join(workspacePath, 'permissions.json'),
      JSON.stringify({ allowedBashPatterns: [{ pattern: '[' }] }),
    )

    const context = createPiContext({
      sessionId: 'session-1',
      workspacePath,
      onPlanSubmitted: () => {},
    })
    const result = await handleConfigValidate(context, { target: 'permissions' })
    const allResult = await handleConfigValidate(context, { target: 'all' })

    expect(context.validators).toBeDefined()
    expect(result.isError).toBe(false)
    expect(result.content[0]?.text).toContain('Validation failed')
    expect(result.content[0]?.text).toContain('Invalid regular expression')
    expect(allResult.content[0]?.text).toContain('Invalid regular expression')
  })
})
