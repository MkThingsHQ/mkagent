import { beforeEach, describe, expect, it, mock } from 'bun:test'

let includeCoAuthor = true
mock.module('../../config/preferences.ts', () => ({
  getCoAuthorPreference: () => includeCoAuthor,
  formatPreferencesForPrompt: () => '',
}))

import { getMiniAgentSystemPrompt, getSystemPrompt } from '../system.ts'

const gitHeading = '## Git Conventions'
const coAuthor = 'Co-Authored-By: MkAgent <agents-noreply@mkagent.app>'

describe('MkAgent system prompt', () => {
  it('uses the retained backend-neutral tool guidance', () => {
    const prompt = getSystemPrompt('', undefined, '/tmp/workspace', undefined, 'default', 'MkAgent Backend', false)
    expect(prompt).toContain('MkAgent')
    expect(prompt).toContain('rg')
    expect(prompt).toContain('## External Sources')
    expect(prompt).toContain('/tmp/workspace/sources/{slug}/')
    expect(prompt).toContain('## Source Management Tools')
    expect(prompt).toContain('mcp__sources__{slug}__{tool}')
    expect(prompt).toContain('## Source Templates')
    expect(prompt).not.toContain('Automations')
  })

  it('keeps the Craft mini-agent configuration workflow', () => {
    const prompt = getMiniAgentSystemPrompt('/tmp/workspace')
    expect(prompt).toContain('skills/{slug}/SKILL.md')
    expect(prompt).toContain('config_validate')
    expect(prompt).toContain('/tmp/workspace')
  })

  it('uses backend-neutral debug log querying guidance', () => {
    const prompt = getSystemPrompt(undefined, { enabled: true, logFilePath: '/tmp/main.log' }, '/tmp/workspace', '/tmp/workspace')
    expect(prompt).toContain('Use Bash with `rg`/`grep` to search logs efficiently:')
    expect(prompt).toContain('rg -n "session" "/tmp/main.log"')
    expect(prompt).not.toContain('Use the Grep tool (if available)')
  })

  it('does not claim call_llm has Grep', () => {
    const prompt = getSystemPrompt(undefined, undefined, '/tmp/workspace', '/tmp/workspace')
    expect(prompt).toContain('The subtask needs file/shell tools (for example, Read or Bash)')
    expect(prompt).not.toContain('The subtask needs tools (Read, Bash, Grep)')
  })
})

describe('includeCoAuthoredBy handling', () => {
  beforeEach(() => {
    includeCoAuthor = true
  })

  it('includes Git Conventions when explicitly true', () => {
    const prompt = getSystemPrompt(undefined, undefined, '/tmp/workspace', '/tmp/workspace', undefined, undefined, true)
    expect(prompt).toContain(gitHeading)
    expect(prompt).toContain(coAuthor)
  })

  it('omits Git Conventions when explicitly false', () => {
    const prompt = getSystemPrompt(undefined, undefined, '/tmp/workspace', '/tmp/workspace', undefined, undefined, false)
    expect(prompt).not.toContain(gitHeading)
    expect(prompt).not.toContain(coAuthor)
  })

  it('uses the saved preference when the argument is omitted', () => {
    includeCoAuthor = false
    const prompt = getSystemPrompt(undefined, undefined, '/tmp/workspace', '/tmp/workspace')
    expect(prompt).not.toContain(gitHeading)
  })

  it('defaults to the enabled saved preference', () => {
    const prompt = getSystemPrompt(undefined, undefined, '/tmp/workspace', '/tmp/workspace')
    expect(prompt).toContain(gitHeading)
    expect(prompt).toContain(coAuthor)
  })
})
