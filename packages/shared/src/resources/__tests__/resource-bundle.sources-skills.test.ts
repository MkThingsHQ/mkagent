import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { exportResources, importResources, validateResourceBundle } from '../resource-bundle.ts'

const roots: string[] = []

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'mkagent-resources-'))
  roots.push(root)
  mkdirSync(join(root, 'sources'), { recursive: true })
  mkdirSync(join(root, 'skills'), { recursive: true })
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Sources and Skills resource bundles', () => {
  it('exports a sanitized Source and a complete Skill', () => {
    const root = workspace()
    const sourceDir = join(root, 'sources', 'example')
    mkdirSync(sourceDir)
    writeFileSync(join(sourceDir, 'config.json'), JSON.stringify({
      id: 'example_1234',
      name: 'Example',
      slug: 'example',
      enabled: true,
      provider: 'example',
      type: 'api',
      api: {
        baseUrl: 'https://api.example.com',
        authType: 'header',
        headerName: 'X-API-Key',
        defaultHeaders: { 'X-API-Key': 'must-not-export' },
      },
      isAuthenticated: true,
      connectionStatus: 'connected',
    }))
    writeFileSync(join(sourceDir, 'guide.md'), '# Example')

    const skillDir = join(root, 'skills', 'example-skill')
    mkdirSync(skillDir)
    writeFileSync(join(skillDir, 'SKILL.md'), '# Example Skill')

    const { bundle, warnings } = exportResources(root, { sources: 'all', skills: 'all' })

    expect(bundle.resources.sources).toHaveLength(1)
    expect(bundle.resources.sources?.[0]?.config.isAuthenticated).toBe(false)
    expect(bundle.resources.sources?.[0]?.config.api?.defaultHeaders).toBeUndefined()
    expect(bundle.resources.sources?.[0]?.files.map(file => file.relativePath)).toEqual(['guide.md'])
    expect(bundle.resources.skills?.[0]?.files.map(file => file.relativePath)).toEqual(['SKILL.md'])
    expect(warnings.some(warning => warning.includes('defaultHeaders'))).toBe(true)
  })

  it('imports Sources and Skills and clears overwritten Source credentials', async () => {
    const sourceRoot = workspace()
    const sourceDir = join(sourceRoot, 'sources', 'public-api')
    mkdirSync(sourceDir)
    writeFileSync(join(sourceDir, 'config.json'), JSON.stringify({
      id: 'public-api_1234',
      name: 'Public API',
      slug: 'public-api',
      enabled: true,
      provider: 'custom',
      type: 'api',
      api: { baseUrl: 'https://api.example.com', authType: 'none' },
    }))
    const skillDir = join(sourceRoot, 'skills', 'helper')
    mkdirSync(skillDir)
    writeFileSync(join(skillDir, 'SKILL.md'), '# Helper')

    const { bundle } = exportResources(sourceRoot, { sources: 'all', skills: 'all' })
    expect(validateResourceBundle(bundle)).toEqual({ valid: true, errors: [] })

    const targetRoot = workspace()
    mkdirSync(join(targetRoot, 'sources', 'public-api'))
    writeFileSync(join(targetRoot, 'sources', 'public-api', 'config.json'), '{}')
    const cleared: string[] = []

    const result = await importResources(targetRoot, bundle, 'overwrite', {
      clearSourceCredentials: async (_workspaceId, slug) => { cleared.push(slug) },
    })

    expect(result.sources.imported).toEqual(['public-api'])
    expect(result.skills.imported).toEqual(['helper'])
    expect(cleared).toEqual(['public-api'])
    expect(JSON.parse(readFileSync(join(targetRoot, 'sources', 'public-api', 'config.json'), 'utf-8')).slug).toBe('public-api')
  })
})
