import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('headless server launchers', () => {
  it('adds bundled document tools and runtimes to the Windows PATH', () => {
    const source = readFileSync(resolve(import.meta.dir, 'build-server.ts'), 'utf-8')

    expect(source).toContain('set "PATH=%ROOT%resources\\\\bin;')
    expect(source).toContain('%ROOT%vendor\\\\bun;%PATH%')
  })
})
