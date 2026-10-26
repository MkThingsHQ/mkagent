import { describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { pathToFileURL } from 'url'

const STORAGE_MODULE_PATH = pathToFileURL(join(import.meta.dir, '..', 'storage.ts')).href

describe('getAutoCompactWindow', () => {
  it('returns only integers the supported Pi setting accepts (100K–1M), else undefined for the SDK default', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'mkagent-config-compact-'))
    const values = [null, 400_000, 100_000, 1_000_000, 99_999, 1_000_001, 250_000.5, '400000']
    // One subprocess (storage resolves CONFIG_DIR at import): rewrite config.json per value
    // and read it back through the real getter.
    const run = Bun.spawnSync([
      process.execPath,
      '--eval',
      `import { writeFileSync } from 'fs'
       import { getAutoCompactWindow } from '${STORAGE_MODULE_PATH}'
       for (const autoCompactWindow of ${JSON.stringify(values)}) {
         writeFileSync(${JSON.stringify(join(configDir, 'config.json'))}, JSON.stringify({
           workspaces: [], activeWorkspaceId: null, activeSessionId: null, autoCompactWindow,
         }))
         console.log(String(getAutoCompactWindow()))
       }`,
    ], {
      env: { ...process.env, CONFIG_DIR: configDir },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    if (run.exitCode !== 0) {
      throw new Error(`subprocess failed (exit ${run.exitCode})\nstderr:\n${run.stderr.toString()}`)
    }

    expect(run.stdout.toString().trim().split('\n')).toEqual([
      'undefined', '400000', '100000', '1000000', 'undefined', 'undefined', 'undefined', 'undefined',
    ])
  })
})
