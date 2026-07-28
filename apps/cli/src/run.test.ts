import { describe, expect, it } from 'bun:test'
import { parseArgs } from './index.ts'

describe('run command', () => {
  it('uses an existing server when URL and token are provided', () => {
    const args = parseArgs([
      'bun', 'mkagent', '--url', 'ws://127.0.0.1:9100', '--token', 'secret',
      'run', 'hello',
    ])
    expect(args.url).toBe('ws://127.0.0.1:9100')
    expect(args.token).toBe('secret')
    expect(args.command).toBe('run')
    expect(args.rest).toEqual(['hello'])
  })
})
