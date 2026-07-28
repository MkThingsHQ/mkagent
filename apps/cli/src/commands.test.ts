import { describe, expect, it } from 'bun:test'
import { parseArgs } from './index.ts'

describe('CLI command parsing', () => {
  it('parses connection and machine-output options', () => {
    const args = parseArgs([
      'bun', 'mkagent', '--json', '--provider', 'openai', '--model', 'gpt-5.5',
      'connections', 'add', 'openai-main',
    ])
    expect(args.json).toBe(true)
    expect(args.provider).toBe('openai')
    expect(args.model).toBe('gpt-5.5')
    expect(args.command).toBe('connections')
    expect(args.rest).toEqual(['add', 'openai-main'])
  })

  it('rejects unsupported custom endpoint protocols', () => {
    expect(() => parseArgs(['bun', 'mkagent', '--protocol', 'unknown', 'run']))
      .toThrow('openai-completions or anthropic-messages')
  })
})
