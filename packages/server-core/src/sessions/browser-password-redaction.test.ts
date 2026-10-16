import { describe, expect, it } from 'bun:test'
import type { AgentEvent } from '@mkagent/core/types'
import type { SessionEvent } from '@mkagent/shared/protocol'
import { SessionManager, createManagedSession } from './SessionManager.ts'

type ManagedSession = ReturnType<typeof createManagedSession>
type EventHarness = {
  handleAgentEvent(managed: ManagedSession, event: AgentEvent): boolean
  emit(workspaceId: string, event: SessionEvent): void
  persistSession(managed: ManagedSession): void
  nextTimestamp(): number
}

/** The real tool_result handling, without agents, disk writes or the developer's config. */
function harness(toolInput: Record<string, unknown>, toolName = 'mcp__session__browser_tool') {
  const manager = Object.create(SessionManager.prototype) as EventHarness
  const events: SessionEvent[] = []
  let persisted = 0
  manager.emit = (_workspaceId, event) => { events.push(event) }
  manager.persistSession = () => { persisted += 1 }
  manager.nextTimestamp = () => Date.now()
  const managed = createManagedSession({ id: 'password-redaction' }, {
    id: 'workspace', slug: 'workspace', name: 'Test', rootPath: '/unused-password-redaction', createdAt: Date.now(),
  })
  managed.messages.push({
    id: 'tool-msg', role: 'tool', content: '', timestamp: 1,
    toolName, toolUseId: 'tu-1', toolInput, toolStatus: 'executing',
  })
  const result = (text: string) => manager.handleAgentEvent(managed, { type: 'tool_result', toolUseId: 'tu-1', toolName, result: text, isError: false })
  return { managed, events, result, persisted: () => persisted }
}

/** How Claude stores an MCP tool result: its content blocks as pretty-printed JSON. */
const claudeResult = (text: string) => JSON.stringify([{ type: 'text', text }], null, 2)

describe('browser_tool password fills in tool_result', () => {
  it('redacts the stored input, persists it and sends it to the renderer', async () => {
    const { managed, events, result, persisted } = harness({ command: 'fill @e1 user@example.com; fill @e2 hunter2; click @e3' })
    await result(claudeResult('Filled element @e1 with "user@example.com"\nFilled password field @e2 (7 characters)\nClicked element @e3'))

    const redacted = { command: 'fill @e1 user@example.com; fill @e2 [password: 7 characters]; click @e3' }
    expect(managed.messages[0]!.toolInput).toEqual(redacted)
    expect(managed.messages[0]!.toolStatus).toBe('completed')
    expect(JSON.stringify(managed.messages)).not.toContain('hunter2')
    expect(persisted()).toBe(1)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'tool_result', toolUseId: 'tu-1', toolInput: redacted })
  })

  it('redacts an array-mode input from a plain-text (Pi) result', async () => {
    const { managed, events, result } = harness({ command: ['fill', '@e2', 'hunter2'] }, 'browser_tool')
    await result('Filled password field @e2 (7 characters)\nActive element after: input')

    expect(managed.messages[0]!.toolInput).toEqual({ command: ['fill', '@e2', '[password: 7 characters]'] })
    expect(events[0]).toMatchObject({ toolInput: { command: ['fill', '@e2', '[password: 7 characters]'] } })
  })

  it('leaves other fills alone and sends no input', async () => {
    const input = { command: 'fill @e1 user@example.com' }
    const { managed, events, result } = harness(input)
    await result(claudeResult('Filled element @e1 with "user@example.com"'))

    expect(managed.messages[0]!.toolInput).toBe(input)
    expect(events).toHaveLength(1)
    expect(events[0]).not.toHaveProperty('toolInput')
  })

  it('does not touch other tools whose output mentions a password fill', async () => {
    const input = { command: 'fill @e2 notes.txt' }
    const { managed, events, result } = harness(input, 'Bash')
    await result('Filled password field @e2 (7 characters)')

    expect(managed.messages[0]!.toolInput).toBe(input)
    expect(events[0]).not.toHaveProperty('toolInput')
  })

  it('keeps the placeholder when the same result arrives twice', async () => {
    const { managed, events, result } = harness({ command: 'fill @e2 hunter2' })
    const text = claudeResult('Filled password field @e2 (7 characters)')
    await result(text)
    await result(text)

    expect(managed.messages[0]!.toolInput).toEqual({ command: 'fill @e2 [password: 7 characters]' })
    expect(events.at(-1)).not.toHaveProperty('toolInput')
  })
})


it('redacts streamed input and keeps a compact transcript/export free of browser secrets', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const root = mkdtempSync(join(tmpdir(), 'mkagent-password-export-'))
  const manager = new SessionManager()
  const managed = createManagedSession({ id: 'export-redaction' }, { id: 'ws', slug: 'ws', name: 'Test', rootPath: root, createdAt: 1 })
  const events: SessionEvent[] = []
  const internal = manager as unknown as {
    sessions: Map<string, ManagedSession>
    emit(workspaceId: string, event: SessionEvent): void
    handleAgentEvent(managed: ManagedSession, event: AgentEvent): boolean
  }
  internal.sessions.set(managed.id, managed)
  internal.emit = (_ws, event) => { events.push(event) }
  try {
    internal.handleAgentEvent(managed, { type: 'tool_start', toolUseId: 'secret', toolName: 'browser_tool', input: { command: ['fill', '@e2', 'hunter2'] } })
    internal.handleAgentEvent(managed, { type: 'tool_result', toolUseId: 'secret', toolName: 'browser_tool', result: 'Filled password field @e2 (7 characters)', isError: false })
    expect(events.at(-1)).toMatchObject({ toolInput: { command: ['fill', '@e2', '[password: 7 characters]'] } })
    expect(managed.pendingToolInputs.size).toBe(0)
    const bundle = await manager.exportSession(managed.id, 'ws')
    expect(bundle).not.toBeNull()
    expect(JSON.stringify(bundle)).not.toContain('hunter2')
  } finally {
    await manager.cleanup()
    rmSync(root, { recursive: true, force: true })
  }
})
