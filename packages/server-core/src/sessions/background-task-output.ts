/**
 * Background task output for the task chip's card: which file a background task writes to, and a
 * bounded, readable digest of it. A shell's output is plain text (the card shows its tail); an
 * agent's `.output` file is its JSONL transcript, digested into its latest message and recent steps
 * (the raw transcript is megabytes of JSON nobody should read).
 */

import { open, stat } from 'node:fs/promises'
import type { BackgroundTaskOutput, BackgroundTaskStep } from '@mkagent/shared/protocol'

export type { BackgroundTaskOutput, BackgroundTaskStep }

/** Tail of a shell's output the card receives (it scrolls to the end). */
export const TASK_OUTPUT_TEXT_TAIL_BYTES = 64 * 1024
/** Tail of an agent transcript read for its digest: enough for the recent steps and latest message. */
export const TASK_OUTPUT_TRANSCRIPT_TAIL_BYTES = 1024 * 1024
/** Recent steps an agent digest keeps. */
export const TASK_OUTPUT_MAX_STEPS = 6
/** Longest agent message returned (the card clamps it; "Open" shows the whole of this). */
export const TASK_OUTPUT_MAX_MESSAGE_CHARS = 100_000

/**
 * The output file a launch acknowledgement names, when it is the task's own `<taskId>.output`. The
 * text is a tool result, so anything else is ignored rather than trusted as a path to read.
 *   Agent: "Async agent launched … agentId: a1 … output_file: /tmp/…/tasks/a1.output"
 *   Bash:  "Command running in background with ID: b1. Output is being written to: /tmp/…/tasks/b1.output"
 */
export function launchOutputFile(resultText: string, taskId: string): string | undefined {
  // The SDK writes task output to `<temp>/…/tasks/<taskId>.output`. The path is read up to that name
  // rather than to the first space: a Windows temp folder can sit under `C:\Users\Jane Doe\`.
  const name = `${taskId}.output`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = resultText.match(new RegExp(
    `(?:output_file:|Output is being written to:)\\s*([^\\r\\n]*?[\\\\/]tasks[\\\\/]${name})(?=[.,;)]*(?:\\s|$))`, 'i',
  ))
  const path = match?.[1]
  if (!path || !/^(?:\/|[A-Za-z]:[\\/])/.test(path)) return undefined
  const [dir, file] = path.split(/[\\/]/).slice(-2)
  return dir === 'tasks' && file === `${taskId}.output` ? path : undefined
}

/** Short label for a tool call: what it worked on, for the card's step list. */
export function describeToolCall(name: string, input: Record<string, unknown>): string | undefined {
  const text = (key: string) => (typeof input[key] === 'string' && (input[key] as string).trim() ? (input[key] as string).trim() : undefined)
  const firstLine = (value: string | undefined) => value?.split('\n')[0]?.slice(0, 120)
  const fileName = (value: string | undefined) => value?.split(/[\\/]/).pop()
  switch (name) {
    case 'Bash':
      return text('description') ?? firstLine(text('command'))
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return fileName(text('file_path'))
    case 'NotebookEdit':
      return fileName(text('notebook_path'))
    case 'Grep':
    case 'Glob':
      return text('pattern')
    case 'WebFetch': {
      const url = text('url')
      try { return url ? new URL(url).hostname : undefined } catch { return url }
    }
    case 'WebSearch':
      return text('query')
    case 'Task':
    case 'Agent':
      return text('description')
    default:
      return text('_displayName') ?? text('description') ?? firstLine(text('_intent'))
  }
}

/**
 * Digest of an agent transcript (JSONL, oldest first): its latest non-empty message and its most
 * recent tool calls. Lines that are not transcript entries (a partial first line of a tail read) are
 * skipped.
 */
export function digestAgentTranscript(lines: readonly string[]): { message: string | null; steps: BackgroundTaskStep[] } {
  let message: string | null = null
  const steps: BackgroundTaskStep[] = []
  for (const line of lines) {
    let entry: { type?: unknown; message?: { content?: unknown } } | null
    try { entry = JSON.parse(line) } catch { continue }
    if (entry?.type !== 'assistant' || !Array.isArray(entry.message?.content)) continue
    for (const block of entry.message.content as Array<{ type?: unknown; text?: unknown; name?: unknown; input?: unknown }>) {
      if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        message = block.text.trim()
      } else if (block?.type === 'tool_use' && typeof block.name === 'string') {
        const input = block.input && typeof block.input === 'object' ? block.input as Record<string, unknown> : {}
        const label = describeToolCall(block.name, input)
        steps.push(label ? { tool: block.name, label } : { tool: block.name })
      }
    }
  }
  return {
    message: message && message.length > TASK_OUTPUT_MAX_MESSAGE_CHARS ? `${message.slice(0, TASK_OUTPUT_MAX_MESSAGE_CHARS)}…` : message,
    steps: steps.slice(-TASK_OUTPUT_MAX_STEPS),
  }
}

/** True when complete lines look like an agent transcript (JSON entries with a `type` and a `uuid`). */
function looksLikeTranscript(lines: readonly string[]): boolean {
  for (const line of lines.slice(-5)) {
    try {
      const entry = JSON.parse(line) as { type?: unknown; uuid?: unknown }
      if (typeof entry?.type === 'string' && typeof entry.uuid === 'string') return true
    } catch { /* not JSON */ }
  }
  return false
}

/** The last `maxBytes` of a file as text, and whether anything before them was cut. */
async function readTail(path: string, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  // Regular files only (following the agent symlink): opening a FIFO would block
  if (!(await stat(path)).isFile()) throw new Error(`not a regular file: ${path}`)
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const start = Math.max(0, size - maxBytes)
    const buffer = Buffer.alloc(size - start)
    const { bytesRead } = buffer.length > 0 ? await handle.read(buffer, 0, buffer.length, start) : { bytesRead: 0 }
    let text = buffer.subarray(0, bytesRead).toString('utf8')
    // A cut-off tail starts mid-line (maybe mid-character): drop that partial line.
    if (start > 0) text = text.slice(text.indexOf('\n') + 1)
    return { text, truncated: start > 0 }
  } finally {
    await handle.close()
  }
}

/**
 * Read a task's output file (following the SDK's symlink for agents) into the card's shape. A
 * shell's file is text; for anything else the content decides, since generic tasks (Monitor, MCP
 * tasks) are announced like agents but write text. Throws when the file is missing.
 */
export async function readBackgroundTaskOutput(path: string, kind?: 'agent' | 'shell' | 'workflow'): Promise<BackgroundTaskOutput> {
  if (kind === 'shell') {
    const { text, truncated } = await readTail(path, TASK_OUTPUT_TEXT_TAIL_BYTES)
    return { kind: 'text', text, truncated }
  }
  const tail = await readTail(path, TASK_OUTPUT_TRANSCRIPT_TAIL_BYTES)
  const lines = tail.text.split('\n').filter(line => line.trim())
  if (looksLikeTranscript(lines)) {
    return { kind: 'agent', ...digestAgentTranscript(lines), truncated: tail.truncated }
  }
  if (tail.text.length <= TASK_OUTPUT_TEXT_TAIL_BYTES) return { kind: 'text', text: tail.text, truncated: tail.truncated }
  const cut = tail.text.slice(-TASK_OUTPUT_TEXT_TAIL_BYTES)
  return { kind: 'text', text: cut.slice(cut.indexOf('\n') + 1), truncated: true }
}
