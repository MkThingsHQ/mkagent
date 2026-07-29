import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('@mkagent/ui package exports', () => {
  it('points every explicit export at an existing file', () => {
    const packageRoot = resolve(import.meta.dir, '..', '..')
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf-8')) as {
      exports: Record<string, string>
    }

    for (const [name, target] of Object.entries(manifest.exports)) {
      expect(existsSync(resolve(packageRoot, target)), `${name} -> ${target}`).toBe(true)
    }
  })
})
