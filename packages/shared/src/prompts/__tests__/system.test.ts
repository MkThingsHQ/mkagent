import { describe, expect, it } from 'bun:test'
import { getMiniAgentSystemPrompt, getSystemPrompt } from '../system.ts'

describe('MkAgent system prompt', () => {
  it('uses the retained backend-neutral tool guidance', () => {
    const prompt = getSystemPrompt('', undefined, '/tmp/workspace', undefined, 'default', 'MkAgent Backend', false)
    expect(prompt).toContain('MkAgent')
    expect(prompt).toContain('rg')
    expect(prompt).not.toContain('Sources')
    expect(prompt).not.toContain('Automations')
  })

  it('keeps the Craft mini-agent configuration workflow', () => {
    const prompt = getMiniAgentSystemPrompt('/tmp/workspace')
    expect(prompt).toContain('skills/{slug}/SKILL.md')
    expect(prompt).toContain('config_validate')
    expect(prompt).toContain('/tmp/workspace')
  })
})
