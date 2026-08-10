import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentEvent } from '@mkagent/core/types'
import { resolveBackendContext } from '@mkagent/shared/agent/backend'
import { SessionManager, createManagedSession } from './SessionManager.ts'
import { buildBackendRuntimeSignature, buildRestartRequiredSignature } from './runtime-config.ts'

describe('retained session event behavior', () => {
  let root: string
  let manager: SessionManager

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mkagent-retained-events-'))
    manager = new SessionManager()
  })

  afterEach(() => {
    manager.cleanup()
    rmSync(root, { recursive: true, force: true })
  })

  function buildSession(id: string, events: AgentEvent[]) {
    const workspace = {
      id: 'ws_test',
      name: 'Test Workspace',
      rootPath: root,
      createdAt: Date.now(),
    }
    const managed = createManagedSession(
      { id, name: 'retained event test' },
      workspace as never,
      { messagesLoaded: true },
    )
    managed.agent = {
      isProcessing: () => false,
      updateRuntimeConfig: async () => true,
      getSummarizeCallback: () => async () => null,
      setAllSources: () => {},
      setSourceServers: async () => {},
      redirect: () => false,
      chat: async function* () {
        for (const event of events) yield event
      },
      destroy: () => {},
      dispose: () => {},
    } as never

    const context = resolveBackendContext({})
    managed.backendRuntimeSignature = buildBackendRuntimeSignature({
      connection: context.connection,
      provider: context.provider,
      authType: context.authType,
      resolvedModel: context.resolvedModel,
    })
    managed.backendRestartSignature = buildRestartRequiredSignature({
      connection: context.connection,
      provider: context.provider,
      authType: context.authType,
      resolvedModel: context.resolvedModel,
    })
    ;(manager as unknown as { sessions: Map<string, unknown> }).sessions.set(id, managed)
    return managed
  }

  it('keeps an internal background-task nudge out of the visible transcript', async () => {
    const sessionId = 'hidden-nudge'
    buildSession(sessionId, [{ type: 'complete' }])

    await manager.sendMessage(
      sessionId,
      '[background-task-completed] Read the output and present it.',
      undefined,
      undefined,
      { hidden: true },
    )

    const session = await manager.getSession(sessionId)
    expect(session?.messages.find(message => message.role === 'user')?.hidden).toBe(true)
  })

  it('forwards workflow identity and live agent completion events to the renderer', async () => {
    const sessionId = 'workflow-events'
    buildSession(sessionId, [
      {
        type: 'task_backgrounded',
        toolUseId: 'tool-1',
        taskId: 'task-1',
        kind: 'workflow',
        workflowId: 'workflow-1',
        intent: 'Review retained code',
      },
      {
        type: 'workflow_agent_completed',
        workflowId: 'workflow-1',
        agentId: 'agent-1',
      },
      { type: 'complete' },
    ])
    const emitted: Array<Record<string, unknown>> = []
    manager.setEventSink((_channel, _target, event) => emitted.push(event))

    await manager.sendMessage(sessionId, 'Run the workflow')

    expect(emitted.find(event => event.type === 'task_backgrounded')).toMatchObject({
      kind: 'workflow',
      workflowId: 'workflow-1',
    })
    expect(emitted.find(event => event.type === 'workflow_agent_completed')).toMatchObject({
      workflowId: 'workflow-1',
      agentId: 'agent-1',
    })
  })

  it('persists a plain backend error and reports an error completion', async () => {
    const sessionId = 'plain-error'
    buildSession(sessionId, [
      { type: 'error', message: 'Provider request failed' },
      { type: 'complete' },
    ])
    let stopReason: string | undefined
    manager.onSessionComplete(event => { stopReason = event.stopReason })

    await manager.sendMessage(sessionId, 'Trigger a provider error')

    const session = await manager.getSession(sessionId)
    expect(session?.messages.find(message => message.role === 'error')?.content).toBe('Provider request failed')
    expect(stopReason).toBe('error')
  })

  it('persists structured backend error diagnostics', async () => {
    const sessionId = 'typed-error'
    buildSession(sessionId, [
      {
        type: 'typed_error',
        error: {
          code: 'rate_limited',
          title: 'Rate limited',
          message: 'Try again later.',
          actions: [],
          canRetry: true,
          retryDelayMs: 1_000,
          details: ['request-id=test'],
          originalError: 'HTTP 429',
        },
      },
      { type: 'complete' },
    ])

    await manager.sendMessage(sessionId, 'Trigger a typed error')

    const error = (await manager.getSession(sessionId))?.messages.find(message => message.role === 'error')
    expect(error).toMatchObject({
      content: 'Rate limited: Try again later.',
      errorCode: 'rate_limited',
      errorTitle: 'Rate limited',
      errorCanRetry: true,
      errorDetails: ['request-id=test'],
      errorOriginal: 'HTTP 429',
    })
  })

  it('terminates a registered background shell and emits its removal event', async () => {
    const sessionId = 'kill-shell'
    const shellId = 'shell-1'
    const marker = `mkagent-kill-shell-${crypto.randomUUID()}`
    const child = Bun.spawn([
      process.execPath,
      '--eval',
      'setTimeout(() => {}, 30_000)',
      marker,
    ], { stdout: 'ignore', stderr: 'ignore' })

    try {
      buildSession(sessionId, [
        {
          type: 'shell_backgrounded',
          toolUseId: 'tool-shell',
          shellId,
          command: marker,
        },
        { type: 'complete' },
      ])
      const emitted: Array<Record<string, unknown>> = []
      manager.setEventSink((_channel, _target, event) => emitted.push(event))
      await manager.sendMessage(sessionId, 'Start a background shell')

      expect(await manager.killShell(sessionId, shellId)).toEqual({ success: true })
      const exited = await Promise.race([
        child.exited.then(() => true),
        new Promise<false>(resolve => setTimeout(() => resolve(false), 2_000)),
      ])
      expect(exited).toBe(true)
      expect(emitted).toContainEqual({ type: 'shell_killed', sessionId, shellId })
    } finally {
      child.kill()
      await child.exited
    }
  })
})
