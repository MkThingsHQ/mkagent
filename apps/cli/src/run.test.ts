import { describe, expect, it } from 'bun:test'
import { RPC_CHANNELS } from '@mkagent/shared/protocol'
import { getTurnExitCode, parseArgs, resolveWorkspace, shouldSetupLlmConnection } from './index.ts'

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

  it('parses stream-json output', () => {
    expect(parseArgs(['bun', 'mkagent', '--output-format', 'stream-json', 'run', 'hello']).outputFormat).toBe('stream-json')
  })

  it('parses the no-cleanup flag', () => {
    expect(parseArgs(['bun', 'mkagent', '--no-cleanup', 'run', 'hello']).noCleanup).toBe(true)
  })

  it('parses workspace-dir', () => {
    expect(parseArgs(['bun', 'mkagent', '--workspace-dir', '/tmp/workspace', 'run', 'hello']).workspaceDir).toBe('/tmp/workspace')
  })

  it('leaves workspace-dir undefined by default', () => {
    expect(parseArgs(['bun', 'mkagent', 'run', 'hello']).workspaceDir).toBeUndefined()
  })

  it('bootstraps a connection only when required', () => {
    expect(shouldSetupLlmConnection(0, { provider: 'deepseek', baseUrl: '' })).toBe(true)
    expect(shouldSetupLlmConnection(1, { provider: 'deepseek', baseUrl: '' })).toBe(false)
  })

  it('binds the default workspace before waiting for streamed events', async () => {
    const calls: Array<{ channel: string; args: unknown[] }> = []
    const client = {
      invoke: async (channel: string, ...args: unknown[]) => {
        calls.push({ channel, args })
        if (channel === RPC_CHANNELS.server.GET_WORKSPACES) {
          return [{ id: 'other', slug: 'other' }, { id: 'default-id', slug: 'default' }]
        }
      },
    }
    expect(await resolveWorkspace(client as never)).toBe('default-id')
    expect(calls.at(-1)).toEqual({ channel: RPC_CHANNELS.window.SWITCH_WORKSPACE, args: ['default-id'] })
  })

  it('binds an explicitly selected workspace', async () => {
    const calls: Array<{ channel: string; args: unknown[] }> = []
    const client = { invoke: async (channel: string, ...args: unknown[]) => calls.push({ channel, args }) }
    expect(await resolveWorkspace(client as never, 'chosen')).toBe('chosen')
    expect(calls).toEqual([{ channel: RPC_CHANNELS.window.SWITCH_WORKSPACE, args: ['chosen'] }])
  })

  it('maps completion, errors, and interruption to process exit codes', () => {
    expect(getTurnExitCode([{ type: 'complete', sessionId: 'session-1' }])).toBe(0)
    expect(getTurnExitCode([{ type: 'error', sessionId: 'session-1', error: 'failed' }])).toBe(1)
    expect(getTurnExitCode([{ type: 'interrupted', sessionId: 'session-1' }])).toBe(130)
  })
})
