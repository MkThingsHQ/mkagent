import { describe, expect, it, spyOn } from 'bun:test'
import type { CliRpcClient } from './client.ts'
import { getTurnExitCode, parseArgs, sendAndWait } from './index.ts'

async function run(events: Record<string, unknown>[], format?: string) {
  let listener: (event: unknown) => void = () => {}
  const client = {
    on: (_channel: string, callback: typeof listener) => { listener = callback; return () => {} },
    invoke: async () => { for (const event of events) listener({ sessionId: 'test', ...event }) },
  } as unknown as CliRpcClient
  const output: string[] = []
  const errors: string[] = []
  const stdout = spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => { output.push(String(chunk)); return true })
  const stderr = spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => { errors.push(String(chunk)); return true })
  try {
    const args = parseArgs(['bun', 'index.ts', ...(format ? ['--output-format', format] : []), 'send', 'test', 'hello'])
    const eventsSeen = await sendAndWait(client, 'test', 'hello', args)
    const code = getTurnExitCode(eventsSeen)
    return { code, output: output.join(''), errors: errors.join('') }
  } finally {
    stdout.mockRestore()
    stderr.mockRestore()
  }
}

describe('CLI retry streaming', () => {
  const events = [
    { type: 'text_delta', delta: 'Failed partial', turnId: 'old' },
    { type: 'text_discard', turnId: 'old' },
    { type: 'retry', phase: 'backoff', message: 'Retrying in 2s...' },
    { type: 'retry', phase: 'active' },
    { type: 'text_delta', delta: 'Recovered answer', turnId: 'new' },
    { type: 'complete' },
  ]

  it('delimits irreversible partial output instead of fusing it into the retried answer', async () => {
    const result = await run(events)
    expect(result.code).toBe(0)
    expect(result.output).toContain('Failed partial\n[incomplete response discarded]\n[Retrying in 2s...]\nRecovered answer')
    expect(result.output).not.toContain('Failed partialRecovered answer')
  })

  it('keeps stream-json events verbatim without inserting plain-text markers', async () => {
    const result = await run(events, 'stream-json')
    expect(result.code).toBe(0)
    expect(result.output.trim().split('\n').map(line => JSON.parse(line))).toEqual(
      events.map(event => ({ sessionId: 'test', ...event })),
    )
  })

  it('returns a failure exit code for typed retry exhaustion errors', async () => {
    const result = await run([
      { type: 'retry', phase: 'end' },
      { type: 'typed_error', error: { title: 'Connection Error', message: 'Request failed' } },
      { type: 'complete' },
    ])
    expect(result.code).toBe(1)
    expect(result.errors).toContain('Connection Error: Request failed')
  })
})
