import { afterEach, describe, expect, it } from 'bun:test'
import { homedir } from 'node:os'
import { cleanupModeState, initializeModeState } from '../../mode-manager.ts'
import { runPreToolUseChecks, shouldPromptInAskMode, stripToolMetadata } from '../pre-tool-use.ts'

const sessionId = 'pre-tool-session'
const permissionManager = {
  isCommandWhitelisted: () => false,
  isDangerousCommand: (command: string) => ['rm', 'curl', 'sudo'].includes(command),
  getBaseCommand: (command: string) => command.trim().split(/\s+/)[0] ?? '',
  extractDomainFromNetworkCommand: () => null,
  isDomainWhitelisted: () => false,
}

afterEach(() => cleanupModeState(sessionId))

function run(toolName: string, input: Record<string, unknown>, mode: 'safe' | 'ask' | 'allow-all') {
  initializeModeState(sessionId, mode)
  return runPreToolUseChecks({
    toolName,
    input,
    sessionId,
    permissionMode: mode,
    workspaceRootPath: '/tmp/mkagent-pre-tool',
    workspaceId: 'workspace',
    permissionManager,
  })
}

describe('runPreToolUseChecks retained Pi pipeline', () => {
  it('blocks writes in safe mode', () => {
    expect(run('Write', { file_path: '/tmp/file', content: 'x' }, 'safe').type).toBe('block')
  })

  it('intercepts call_llm and spawn_session before execution', () => {
    expect(run('mcp__session__call_llm', { prompt: 'x' }, 'allow-all').type).toBe('call_llm_intercept')
    cleanupModeState(sessionId)
    expect(run('mcp__session__spawn_session', { prompt: 'x' }, 'allow-all').type).toBe('spawn_session_intercept')
  })

  it('expands paths and strips display metadata', () => {
    const result = run('Read', { file_path: '~/notes.md', _intent: 'read notes' }, 'allow-all')
    expect(result.type).toBe('modify')
    if (result.type !== 'modify') return
    expect(result.input.file_path).toBe(`${homedir()}/notes.md`)
    expect(result.input._intent).toBeUndefined()
  })

  it('prompts for dangerous Bash commands in ask mode', () => {
    const result = run('Bash', { command: 'rm /tmp/file' }, 'ask')
    expect(result.type).toBe('prompt')
  })

  it('keeps built-in tool arguments while removing interceptor metadata', () => {
    expect(stripToolMetadata('Read', { file_path: '/tmp/a', _displayName: 'Read file' })).toEqual({
      modified: true,
      input: { file_path: '/tmp/a' },
    })
  })
})

describe('shouldPromptInAskMode', () => {
  const context = { workspaceRootPath: '/tmp/mkagent-pre-tool', activeSourceSlugs: [] }

  it('prompts for Write', () => {
    expect(shouldPromptInAskMode('Write', { file_path: '/tmp/a' }, permissionManager, context)?.promptType).toBe('file_write')
  })

  it('prompts for Edit', () => {
    expect(shouldPromptInAskMode('Edit', { file_path: '/tmp/a' }, permissionManager, context)?.promptType).toBe('file_write')
  })

  it('prompts for MultiEdit', () => {
    expect(shouldPromptInAskMode('MultiEdit', { file_path: '/tmp/a' }, permissionManager, context)?.promptType).toBe('file_write')
  })

  it('uses notebook_path for NotebookEdit', () => {
    expect(shouldPromptInAskMode('NotebookEdit', { notebook_path: '/tmp/a.ipynb' }, permissionManager, context)?.command).toBe('/tmp/a.ipynb')
  })

  it('auto-allows whitelisted file writes', () => {
    const manager = { ...permissionManager, isCommandWhitelisted: (command: string) => command === 'Write' }
    expect(shouldPromptInAskMode('Write', { file_path: '/tmp/a' }, manager, context)).toBeNull()
  })

  it('prompts for mutating Bash commands', () => {
    expect(shouldPromptInAskMode('Bash', { command: 'npm install' }, permissionManager, context)?.promptType).toBe('bash')
  })

  it('auto-allows whitelisted non-dangerous Bash commands', () => {
    const manager = { ...permissionManager, isCommandWhitelisted: (command: string) => command === 'npm' }
    expect(shouldPromptInAskMode('Bash', { command: 'npm test' }, manager, context)).toBeNull()
  })

  it('still prompts for dangerous whitelisted commands', () => {
    const manager = { ...permissionManager, isCommandWhitelisted: (command: string) => command === 'rm' }
    expect(shouldPromptInAskMode('Bash', { command: 'rm /tmp/a' }, manager, context)?.promptType).toBe('bash')
  })

  it('auto-allows curl to a whitelisted domain', () => {
    const manager = {
      ...permissionManager,
      extractDomainFromNetworkCommand: () => 'api.example.com',
      isDomainWhitelisted: (domain: string) => domain === 'api.example.com',
    }
    expect(shouldPromptInAskMode('Bash', { command: 'curl https://api.example.com' }, manager, context)).toBeNull()
  })

  it('prompts for curl to a non-whitelisted domain', () => {
    expect(shouldPromptInAskMode('Bash', { command: 'curl https://example.com' }, permissionManager, context)?.promptType).toBe('bash')
  })

  it('returns no prompt for Read', () => {
    expect(shouldPromptInAskMode('Read', { file_path: '/tmp/a' }, permissionManager, context)).toBeNull()
  })

  it('returns no prompt for Glob', () => {
    expect(shouldPromptInAskMode('Glob', { pattern: '*' }, permissionManager, context)).toBeNull()
  })

  it('returns no prompt for Grep', () => {
    expect(shouldPromptInAskMode('Grep', { pattern: 'x' }, permissionManager, context)).toBeNull()
  })
})
