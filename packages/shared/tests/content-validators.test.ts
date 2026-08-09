import { describe, expect, it } from 'bun:test'
import {
  detectConfigFileType,
  validateConfigFileContent,
  validatePermissionsContent,
  validateSkillContent,
  validateSourceConfigContent,
} from '../src/config/validators.ts'

describe('validateSourceConfigContent', () => {
  it('passes for valid MCP source config', () => {
    const result = validateSourceConfigContent(JSON.stringify({
      id: 'test-source',
      name: 'Test Source',
      slug: 'test-source',
      enabled: true,
      provider: 'custom',
      type: 'mcp',
      mcp: { url: 'https://example.com/mcp', authType: 'bearer' },
    }))

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('passes for valid API source config', () => {
    const result = validateSourceConfigContent(JSON.stringify({
      id: 'api-source',
      name: 'API Source',
      slug: 'api-source',
      enabled: true,
      provider: 'github',
      type: 'api',
      api: { baseUrl: 'https://api.github.com', authType: 'bearer' },
    }))

    expect(result.valid).toBe(true)
  })

  it('passes for valid stdio MCP source config', () => {
    const result = validateSourceConfigContent(JSON.stringify({
      id: 'stdio-source',
      name: 'Stdio Source',
      slug: 'stdio-source',
      enabled: true,
      provider: 'custom',
      type: 'mcp',
      mcp: { transport: 'stdio', command: '/usr/local/bin/my-server' },
    }))

    expect(result.valid).toBe(true)
  })

  it('fails for invalid JSON', () => {
    const result = validateSourceConfigContent('{ invalid json }')
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.message).toContain('JSON')
  })

  it('fails when required fields are missing', () => {
    const result = validateSourceConfigContent(JSON.stringify({ id: 'x' }))
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('fails when slug has invalid characters', () => {
    const result = validateSourceConfigContent(JSON.stringify({
      id: 'test',
      name: 'Test',
      slug: 'Invalid_Slug!',
      enabled: true,
      provider: 'custom',
      type: 'mcp',
      mcp: { url: 'https://example.com', authType: 'bearer' },
    }))

    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.message.includes('Slug'))).toBe(true)
  })

  it('fails when the type-specific config block is missing', () => {
    const result = validateSourceConfigContent(JSON.stringify({
      id: 'test',
      name: 'Test',
      slug: 'test',
      enabled: true,
      provider: 'custom',
      type: 'mcp',
    }))

    expect(result.valid).toBe(false)
  })

  it('uses Craft EntityColor validation for Source branding', () => {
    const source = {
      id: 'color-source',
      name: 'Color Source',
      slug: 'color-source',
      enabled: true,
      provider: 'custom',
      type: 'api',
      api: { baseUrl: 'https://example.com', authType: 'none' },
    }

    expect(validateSourceConfigContent(JSON.stringify({
      ...source,
      brand: { color: 'accent/50' },
    })).valid).toBe(true)
    expect(validateSourceConfigContent(JSON.stringify({
      ...source,
      brand: { color: 'not-a-system-color' },
    })).valid).toBe(false)
    expect(validateSourceConfigContent(JSON.stringify({
      ...source,
      brand: { color: { light: 'red' } },
    })).valid).toBe(false)
  })
})

describe('validateSkillContent', () => {
  it('accepts a valid Skill and rejects missing instructions', () => {
    expect(validateSkillContent('---\nname: Test\ndescription: Test skill\n---\nDo the work.\n', 'test-skill').valid).toBe(true)
    expect(validateSkillContent('---\nname: Test\ndescription: Test skill\n---\n', 'test-skill').valid).toBe(false)
  })

  it('rejects invalid Skill slugs', () => {
    expect(validateSkillContent('---\nname: Test\ndescription: Test skill\n---\nBody\n', 'Bad Slug').valid).toBe(false)
  })

  it('accepts optional Skill fields', () => {
    const content = '---\nname: Git Helper\ndescription: Helps with git\nglobs:\n  - "**/*.ts"\nalwaysAllow:\n  - Bash\n---\nUse git.\n'
    expect(validateSkillContent(content, 'git-helper').valid).toBe(true)
  })

  it('rejects missing Skill names', () => {
    const result = validateSkillContent('---\ndescription: Missing name\n---\nBody\n', 'test-skill')
    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.path === 'name')).toBe(true)
  })

  it('rejects missing Skill descriptions', () => {
    const result = validateSkillContent('---\nname: Test\n---\nBody\n', 'test-skill')
    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.path === 'description')).toBe(true)
  })

  it('rejects invalid YAML frontmatter', () => {
    expect(validateSkillContent('---\nname: [invalid\n---\nBody\n', 'test-skill').valid).toBe(false)
  })
})

describe('validatePermissionsContent', () => {
  it('accepts an empty config and rejects invalid JSON', () => {
    expect(validatePermissionsContent('{}').valid).toBe(true)
    expect(validatePermissionsContent('{').valid).toBe(false)
  })

  it('rejects invalid regular expressions', () => {
    const result = validatePermissionsContent(JSON.stringify({ allowedBashPatterns: ['['] }))
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.message).toContain('Invalid regular expression')
  })

  it('accepts string and object permission patterns', () => {
    const result = validatePermissionsContent(JSON.stringify({
      allowedBashPatterns: [{ pattern: 'git .*', comment: 'Allow git' }, 'npm test'],
    }))
    expect(result.valid).toBe(true)
  })

  it('uses the requested display filename', () => {
    expect(validatePermissionsContent('{', 'workspace/permissions.json').errors[0]?.file)
      .toBe('workspace/permissions.json')
  })
})

describe('retained config detection', () => {
  const workspace = '/tmp/mkagent-workspace'

  it('detects Source config files and slugs', () => {
    const result = detectConfigFileType(`${workspace}/sources/github/config.json`, workspace)
    expect(result?.type).toBe('source')
    expect(result?.slug).toBe('github')
  })

  it('detects Source-level permissions', () => {
    const result = detectConfigFileType(`${workspace}/sources/linear/permissions.json`, workspace)
    expect(result?.type).toBe('permissions')
    expect(result?.slug).toBe('linear')
    expect(result?.displayFile).toBe('sources/linear/permissions.json')
  })

  it('detects workspace permissions', () => {
    expect(detectConfigFileType(`${workspace}/permissions.json`, workspace)?.type).toBe('permissions')
  })

  it('detects Skill files and slugs', () => {
    const result = detectConfigFileType(`${workspace}/skills/commit/SKILL.md`, workspace)
    expect(result?.type).toBe('skill')
    expect(result?.slug).toBe('commit')
  })

  it('ignores files outside the workspace', () => {
    expect(detectConfigFileType('/tmp/other/permissions.json', workspace)).toBeNull()
  })

  it('dispatches retained permissions validation', () => {
    const detection = detectConfigFileType(`${workspace}/permissions.json`, workspace)
    expect(detection && validateConfigFileContent(detection, '{}', workspace).valid).toBe(true)
  })

  it('dispatches retained Skill validation', () => {
    const detection = detectConfigFileType(`${workspace}/skills/test/SKILL.md`, workspace)
    expect(detection && validateConfigFileContent(detection, '---\nname: Test\ndescription: Test\n---\nBody\n', workspace).valid).toBe(true)
  })

  it('dispatches Source validation', () => {
    const detection = detectConfigFileType(`${workspace}/sources/test/config.json`, workspace)
    const config = JSON.stringify({
      id: 'test',
      name: 'Test',
      slug: 'test',
      enabled: true,
      provider: 'custom',
      type: 'mcp',
      mcp: { url: 'https://example.com', authType: 'none' },
    })

    expect(detection && validateConfigFileContent(detection, config, workspace).valid).toBe(true)
  })

  it('returns Source validation errors for invalid content', () => {
    const detection = detectConfigFileType(`${workspace}/sources/bad/config.json`, workspace)
    const result = detection && validateConfigFileContent(detection, '{ not valid json }', workspace)
    expect(result?.valid).toBe(false)
  })
})
