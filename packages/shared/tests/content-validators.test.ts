import { describe, expect, it } from 'bun:test'
import { detectConfigFileType, validateConfigFileContent, validatePermissionsContent, validateSkillContent } from '../src/config/validators.ts'

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
})
