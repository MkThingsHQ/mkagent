import { describe, expect, it } from 'bun:test'
import { validatePermissionsContent, validateSkillContent } from '../src/config/validators.ts'

describe('validateSkillContent', () => {
  it('accepts a valid Skill and rejects missing instructions', () => {
    expect(validateSkillContent('---\nname: Test\ndescription: Test skill\n---\nDo the work.\n', 'test-skill').valid).toBe(true)
    expect(validateSkillContent('---\nname: Test\ndescription: Test skill\n---\n', 'test-skill').valid).toBe(false)
  })

  it('rejects invalid Skill slugs', () => {
    expect(validateSkillContent('---\nname: Test\ndescription: Test skill\n---\nBody\n', 'Bad Slug').valid).toBe(false)
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
})
