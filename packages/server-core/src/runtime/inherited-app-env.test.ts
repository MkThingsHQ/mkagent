import { describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import { isPathInside, resolveInheritedAppEnv, sourceCheckoutRoot } from './inherited-app-env'

const own = '/work/CraftAgentsDev/sdk-uplift-release'
const app = '/work/CraftAgentsDev/craft-agents-design-remake'

describe('resolveInheritedAppEnv', () => {
  it("ignores a running app's MKAGENT_APP_ROOT and every MKAGENT_* path inside it", () => {
    const env = {
      MKAGENT_APP_ROOT: app,
      MKAGENT_RESOURCES_BASE: `${app}/apps/electron`,
      MKAGENT_UV: `${app}/apps/electron/resources/bin/darwin-arm64/uv`,
      MKAGENT_CLI_ENTRY: `${app}/packages/craft-cli/src/cli.ts`,
      MKAGENT_SESSION_DIR: '/work/CraftAgentWS/sessions/261010-onyx-heron',
      MKAGENT_CONFIG_DIR: '',
      MKAGENT_DEBUG: '1',
      PATH: `${app}/bin:/usr/bin`,
    }
    const result = resolveInheritedAppEnv(env, own, own)
    expect(result.ignoredAppRoot).toBe(app)
    expect(result.appRootPath).toBe(own)
    expect(result.dropKeys.sort()).toEqual(['MKAGENT_APP_ROOT', 'MKAGENT_CLI_ENTRY', 'MKAGENT_RESOURCES_BASE', 'MKAGENT_UV'])
  })

  it('falls back to the checkout root when the cwd is outside it', () => {
    expect(resolveInheritedAppEnv({ MKAGENT_APP_ROOT: app }, own, '/tmp').appRootPath).toBe(own)
  })

  it('keeps a MKAGENT_APP_ROOT inside its own checkout', () => {
    const result = resolveInheritedAppEnv({ MKAGENT_APP_ROOT: `${own}/apps/electron` }, own, own)
    expect(result).toEqual({ appRootPath: `${own}/apps/electron`, dropKeys: [] })
  })

  it('honors MKAGENT_APP_ROOT for bundled servers (no source checkout)', () => {
    expect(resolveInheritedAppEnv({ MKAGENT_APP_ROOT: '/app' }, null, '/srv')).toEqual({ appRootPath: '/app', dropKeys: [] })
  })

  it('defaults to the cwd when MKAGENT_APP_ROOT is unset', () => {
    expect(resolveInheritedAppEnv({}, own, own)).toEqual({ appRootPath: own, dropKeys: [] })
  })
})

describe('sourceCheckoutRoot', () => {
  it('finds this monorepo when server-core runs from source', () => {
    const root = sourceCheckoutRoot()
    expect(root).not.toBeNull()
    expect(isPathInside(join(root!, 'packages', 'server-core'), root!)).toBe(true)
  })

  it('returns null outside a checkout (bundled builds) or without a module folder', () => {
    expect(sourceCheckoutRoot('/a/b/c/d')).toBeNull()
    expect(sourceCheckoutRoot(null)).toBeNull()
  })
})

describe('isPathInside', () => {
  it('treats a sibling with a shared prefix as outside', () => {
    expect(isPathInside('/work/repo-2/x', '/work/repo')).toBe(false)
    expect(isPathInside('/work/repo/x', '/work/repo')).toBe(true)
    expect(isPathInside('/work/repo', '/work/repo')).toBe(true)
  })
})
