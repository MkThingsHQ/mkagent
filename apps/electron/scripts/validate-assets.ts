import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const appDir = join(import.meta.dir, '..')
const platformKey = `${process.platform}-${process.arch}`
const executable = process.platform === 'win32' ? '.exe' : ''
const required = [
  'dist/main.cjs',
  'dist/bootstrap-preload.cjs',
  'dist/browser-toolbar-preload.cjs',
  'dist/interceptor.cjs',
  'dist/renderer/index.html',
  'dist/resources/config-defaults.json',
  'dist/resources/pi-agent-server/index.js',
  `dist/resources/bin/${platformKey}/uv${executable}`,
  `vendor/bun/bun${executable}`,
]

for (const relative of required) {
  const path = join(appDir, relative)
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Missing packaged asset: ${relative}`)
}

for (const removed of ['dist/resources/bridge-mcp-server', 'dist/resources/session-mcp-server', 'dist/resources/bin/craft-agent']) {
  if (existsSync(join(appDir, removed))) throw new Error(`Removed product asset was packaged: ${removed}`)
}

console.log(`Validated ${required.length} packaged assets for ${platformKey}`)
