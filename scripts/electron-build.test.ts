import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SDK_EXTERNAL = '@anthropic-ai/claude-agent-sdk'

describe('Electron CJS build configuration', () => {
  it('externalizes the Claude SDK in main-process bundles', () => {
    const buildScript = readFileSync(resolve(import.meta.dir, 'electron-build-main.ts'), 'utf-8')
    const devScript = readFileSync(resolve(import.meta.dir, 'electron-dev.ts'), 'utf-8')
    const packageJson = JSON.parse(
      readFileSync(resolve(import.meta.dir, '../apps/electron/package.json'), 'utf-8'),
    ) as { scripts: Record<string, string> }

    expect(buildScript).toContain(`--external:${SDK_EXTERNAL}`)
    expect(devScript).toContain(`"${SDK_EXTERNAL}"`)
    expect(devScript).toMatch(
      /const mainContext = await esbuild\.context\([\s\S]*?external: MAIN_BUNDLE_EXTERNALS/,
    )
    expect(packageJson.scripts['build:main']).toContain(`--external:${SDK_EXTERNAL}`)
    expect(packageJson.scripts['build:main:win']).toContain(`--external:${SDK_EXTERNAL}`)
  })

  it('keeps agent runtime modules out of the preload dependency graph', () => {
    const preload = readFileSync(
      resolve(import.meta.dir, '../apps/electron/src/preload/bootstrap.ts'),
      'utf-8',
    )
    const sharedPackage = JSON.parse(
      readFileSync(resolve(import.meta.dir, '../packages/shared/package.json'), 'utf-8'),
    ) as { exports: Record<string, string> }

    expect(preload).not.toContain("from '@mkagent/shared/auth'")
    expect(preload).toContain("from '@mkagent/shared/auth/callback-server'")
    expect(preload).toContain("from '@mkagent/shared/auth/chatgpt-oauth-config'")
    expect(sharedPackage.exports['./auth/callback-server']).toBe('./src/auth/callback-server.ts')
    expect(sharedPackage.exports['./auth/chatgpt-oauth-config']).toBe(
      './src/auth/chatgpt-oauth-config.ts',
    )
  })
})
