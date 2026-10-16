import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

describe('preload native material bridge', () => {
  // Execute the actual synchronous API registration tail with Electron's copy-at-expose contract.
  const source = readFileSync(fileURLToPath(new URL('../bootstrap.ts', import.meta.url)), 'utf8')
  const tail = source.slice(source.indexOf('const WINDOW_VIBRANCY_ARG')).replace('(api as ElectronAPI)', 'api')
  for (const [arg, expected] of [
    ['--craft-window-vibrancy=under-window', 'under-window'],
    ['--craft-window-vibrancy=mica', 'mica'],
    ['--craft-window-vibrancy=unknown', null],
    ['', null],
  ] as const) {
    it(`exposes a working material getter for ${arg || 'absent argument'}`, () => {
      let exposed: any
      vm.runInNewContext(tail, {
        api: {}, process: { argv: arg ? [arg] : [] },
        contextBridge: { exposeInMainWorld: (_name: string, api: any) => { exposed = { ...api } } },
      })
      expect(typeof exposed.getWindowVibrancy).toBe('function')
      expect(exposed.getWindowVibrancy()).toBe(expected)
    })
  }
})
