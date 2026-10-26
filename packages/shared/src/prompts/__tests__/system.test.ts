import { beforeEach, describe, expect, it, mock } from 'bun:test'

let includeCoAuthor = true
mock.module('../../config/preferences.ts', () => ({
  getCoAuthorPreference: () => includeCoAuthor,
  formatPreferencesForPrompt: () => '',
}))
mock.module('../../config/storage.ts', () => ({
  getBrowserToolEnabled: () => true,
}))

import { getMiniAgentSystemPrompt, getSystemPrompt } from '../system.ts'

const gitHeading = '## Git Conventions'
const coAuthor = 'Co-Authored-By: MkAgent <agents-noreply@mkagent.app>'

describe('MkAgent system prompt', () => {
  it('uses the retained backend-neutral tool guidance', () => {
    const prompt = getSystemPrompt('', undefined, '/tmp/workspace', undefined, 'default', 'MkAgent Backend', false)
    expect(prompt).toContain('MkAgent')
    expect(prompt).toContain('rg')
    expect(prompt).not.toContain('Sources')
    expect(prompt).not.toContain('Automations')
  })

  it('keeps child-session prompts narrow using retained Pi tools', () => {
    const prompt = getSystemPrompt('', undefined, '/tmp/workspace')
    expect(prompt).toContain('one narrow question')
    expect(prompt).toContain('offset')
    expect(prompt).toContain('file:line')
    expect(prompt).toContain('explicitly requested model is preserved')
    expect(prompt).not.toContain('## Subagents (Agent tool)')
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

describe('coding agent profile', () => {
  const coding = (includeCoAuthoredBy?: boolean) =>
    getSystemPrompt(undefined, undefined, '/tmp/workspace', '/tmp/workspace', undefined, undefined, includeCoAuthoredBy, 'coding')

  beforeEach(() => {
    includeCoAuthor = true
  })

  it('leaves the default prompt unchanged when the profile is default', () => {
    const plain = getSystemPrompt(undefined, undefined, '/tmp/workspace', '/tmp/workspace')
    const explicitDefault = getSystemPrompt(undefined, undefined, '/tmp/workspace', '/tmp/workspace', undefined, undefined, undefined, 'default')
    expect(explicitDefault).toBe(plain)
  })

  it('stays within the coding budget (preferences are stubbed out here)', () => {
    expect(coding().length).toBeLessThan(3_000)
  })

  it('keeps the coding essentials', () => {
    const prompt = coding()
    expect(prompt).toContain('<mkagent_environment')
    expect(prompt).toContain('Coding mode')
    expect(prompt).toContain('## Coding Workflow')
    expect(prompt).toContain('<project_context_files>')
    expect(prompt).toContain('SubmitPlan')
    expect(prompt).toContain('[skill:slug]')
    expect(prompt).toContain('unified diffs')
    // All four modes stay listed: Claude snapshots the prompt, so a later switch must find its rule
    for (const mode of ['Explore', 'Ask to Edit', 'Execute']) expect(prompt).toContain(mode)
  })

  it('drops the desktop-workflow sections whose tools the coding profile does not register', () => {
    const prompt = coding()
    for (const section of ['## Pages', '## Preview Blocks', '## Structured Data', '## Session Self-Management', '## Automations', '## Configuration Documentation', 'call_llm', 'update_user_preferences', 'mermaid_validate', 'browser_tool']) {
      expect(prompt).not.toContain(section)
    }
  })

  it('honors the co-author preference like the default prompt', () => {
    expect(coding(true)).toContain('Co-Authored-By: MkAgent <agents-noreply@mkagent.app>')
    expect(coding(false)).not.toContain('## Git Conventions')
  })

  it('still appends the user preferences (only the base prompt is swapped)', () => {
    const preferences = '\n<user_preferences>\n- Name: Test User\n</user_preferences>\n'
    const prompt = getSystemPrompt(preferences, undefined, '/tmp/workspace', '/tmp/workspace', undefined, undefined, undefined, 'coding')
    expect(prompt).toContain(preferences)
    // The tool that edits preferences is not registered in coding mode, so the prompt must not offer it
    expect(prompt).not.toContain('update_user_preferences')
  })
})
