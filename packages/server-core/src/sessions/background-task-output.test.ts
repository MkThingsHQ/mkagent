import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  describeToolCall,
  digestAgentTranscript,
  launchOutputFile,
  readBackgroundTaskOutput,
  TASK_OUTPUT_MAX_STEPS,
  TASK_OUTPUT_TEXT_TAIL_BYTES,
} from './background-task-output'

const assistant = (...content: unknown[]) => JSON.stringify({ type: 'assistant', uuid: crypto.randomUUID(), message: { content } })
const user = (text: string) => JSON.stringify({ type: 'user', uuid: crypto.randomUUID(), message: { content: [{ type: 'text', text }] } })

describe('launchOutputFile', () => {
  it('reads the task own output file from agent and shell launch acknowledgements', () => {
    expect(launchOutputFile('Async agent launched. agentId: a1b2 (use this) output_file: /private/tmp/claude-501/p/s/tasks/a1b2.output\nDo not read it', 'a1b2'))
      .toBe('/private/tmp/claude-501/p/s/tasks/a1b2.output')
    expect(launchOutputFile('Command running in background with ID: b9x. Output is being written to: /tmp/p/tasks/b9x.output.', 'b9x'))
      .toBe('/tmp/p/tasks/b9x.output')
  })

  it('reads Windows paths whole, spaces included', () => {
    const path = 'C:\\Users\\Jane Doe\\AppData\\Local\\Temp\\claude-0\\C--proj\\s1\\tasks\\b9x.output'
    expect(launchOutputFile(`Command running in background with ID: b9x. Output is being written to: ${path}`, 'b9x')).toBe(path)
    expect(launchOutputFile(`agentId: a1 (use this) output_file: ${path.replace('b9x', 'a1')} (Read it when done)`, 'a1')).toBe(path.replace('b9x', 'a1'))
    expect(launchOutputFile('Output is being written to: C:/tmp/claude-0/p/s/tasks/b9x.output.', 'b9x')).toBe('C:/tmp/claude-0/p/s/tasks/b9x.output')
  })

  it('ignores paths that are not the task own `<id>.output` file', () => {
    expect(launchOutputFile('agentId: a1 output_file: /Users/me/.ssh/id_rsa', 'a1')).toBeUndefined()
    expect(launchOutputFile('agentId: a1 output_file: /tmp/tasks/other.output', 'a1')).toBeUndefined()
    expect(launchOutputFile('agentId: a1 output_file: tasks/a1.output', 'a1')).toBeUndefined()
    expect(launchOutputFile('agentId: a1 output_file: /Users/me/notes/a1.output', 'a1')).toBeUndefined()
    expect(launchOutputFile('agentId: a1 output_file: /tmp/p/tasks/a1.output2', 'a1')).toBeUndefined()
    expect(launchOutputFile('agentId: a1 output_file: \\tmp\\p\\tasks\\a1.output', 'a1')).toBeUndefined()
    expect(launchOutputFile('Task finished', 'a1')).toBeUndefined()
  })
})

describe('describeToolCall', () => {
  it('names what a call works on', () => {
    expect(describeToolCall('Bash', { command: 'bun test\n--watch', description: 'Run tests' })).toBe('Run tests')
    expect(describeToolCall('Bash', { command: 'bun test\n--watch' })).toBe('bun test')
    expect(describeToolCall('Read', { file_path: '/repo/src/evaluator.ts' })).toBe('evaluator.ts')
    expect(describeToolCall('Grep', { pattern: 'LabelEntrySet' })).toBe('LabelEntrySet')
    expect(describeToolCall('WebFetch', { url: 'https://docs.example.com/a?b=1' })).toBe('docs.example.com')
    expect(describeToolCall('mcp__linear__list_issues', { _displayName: 'List Issues', _intent: 'Find open bugs' })).toBe('List Issues')
    expect(describeToolCall('TodoWrite', { todos: [] })).toBeUndefined()
  })
})

describe('digestAgentTranscript', () => {
  it('keeps the latest message and the most recent steps, skipping partial lines', () => {
    const lines = [
      '{"type":"assist', // partial first line of a tail read
      user('Review the change'),
      assistant({ type: 'text', text: 'Starting with the evaluator.' }, { type: 'tool_use', name: 'Read', input: { file_path: '/r/evaluator.ts' } }),
      ...Array.from({ length: 8 }, (_, i) => assistant({ type: 'tool_use', name: 'Bash', input: { command: `step ${i}` } })),
      assistant({ type: 'text', text: '  Found two issues.  ' }),
    ]
    const digest = digestAgentTranscript(lines)
    expect(digest.message).toBe('Found two issues.')
    expect(digest.steps).toHaveLength(TASK_OUTPUT_MAX_STEPS)
    expect(digest.steps.at(-1)).toEqual({ tool: 'Bash', label: 'step 7' })
  })

  it('has no message before the agent wrote one', () => {
    expect(digestAgentTranscript([user('Go'), assistant({ type: 'tool_use', name: 'Glob', input: { pattern: '**/*.ts' } })]))
      .toEqual({ message: null, steps: [{ tool: 'Glob', label: '**/*.ts' }] })
  })
})

describe('readBackgroundTaskOutput', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'craft-task-output-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns a shell output tail, cut at a line start', async () => {
    const file = join(dir, 'b1.output')
    const line = 'x'.repeat(99) + '\n'
    writeFileSync(file, line.repeat(Math.ceil((TASK_OUTPUT_TEXT_TAIL_BYTES * 2) / line.length)) + 'last line\n')
    const output = await readBackgroundTaskOutput(file, 'shell')
    expect(output.kind).toBe('text')
    if (output.kind !== 'text') throw new Error('unreachable')
    expect(output.truncated).toBe(true)
    expect(output.text.endsWith('last line\n')).toBe(true)
    expect(output.text.startsWith('x'.repeat(99) + '\n')).toBe(true)
    expect(output.text.length).toBeLessThanOrEqual(TASK_OUTPUT_TEXT_TAIL_BYTES)
  })

  it('digests an agent transcript behind the SDK symlink, and detects one without a kind', async () => {
    const transcript = join(dir, 'agent-a1.jsonl')
    writeFileSync(transcript, [user('Go'), assistant({ type: 'text', text: 'Done: all good.' })].join('\n') + '\n')
    const link = join(dir, 'a1.output')
    try {
      symlinkSync(transcript, link)
    } catch (error) {
      // Windows allows symlinks only with Developer Mode or admin rights: read a copy there
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error
      copyFileSync(transcript, link)
    }
    expect(await readBackgroundTaskOutput(link, 'agent')).toEqual({ kind: 'agent', message: 'Done: all good.', steps: [], truncated: false })
    expect((await readBackgroundTaskOutput(link)).kind).toBe('agent')
  })

  it('treats plain text as text even for a task announced like an agent (Monitor), and an empty file as empty text', async () => {
    const file = join(dir, 'c1.output')
    writeFileSync(file, 'hello\nworld\n')
    expect(await readBackgroundTaskOutput(file)).toEqual({ kind: 'text', text: 'hello\nworld\n', truncated: false })
    expect(await readBackgroundTaskOutput(file, 'agent')).toEqual({ kind: 'text', text: 'hello\nworld\n', truncated: false })
    writeFileSync(file, '')
    expect(await readBackgroundTaskOutput(file, 'shell')).toEqual({ kind: 'text', text: '', truncated: false })
  })

  it('throws for a missing file (the caller reports "no output")', async () => {
    await expect(readBackgroundTaskOutput(join(dir, 'missing.output'))).rejects.toThrow()
  })
})
