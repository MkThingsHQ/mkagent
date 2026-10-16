import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionManager, createManagedSession } from './SessionManager'
import { loadSession, saveSession } from '@mkagent/shared/sessions'
import type { AgentEvent } from '@mkagent/core/types'

function harness() {
  const rootPath = mkdtempSync(join(tmpdir(), 'mkagent-turn-usage-'))
  const managed = createManagedSession({ id: 'usage' }, { id: 'ws', slug: 'ws', name: 'Test', rootPath, createdAt: 1 })
  const events: any[] = []
  const manager = Object.create(SessionManager.prototype) as any
  manager.emit = (_workspace: string, event: unknown) => events.push(event)
  manager.persistSession = () => {}
  manager.nextTimestamp = () => Date.now()
  manager.activeViewingByWorkspace = new Map()
  return { managed, events, rootPath, fire: (event: AgentEvent) => manager.handleAgentEvent(managed, event) }
}

describe('Pi session turn billing', () => {
  it('adds completed turns once while streaming updates remain non-billable', async () => {
    const { managed, events, rootPath, fire } = harness()
    try {
      fire({ type: 'usage_update', usage: { inputTokens: 1000 } })
      fire({ type: 'complete', usage: { inputTokens: 1500, outputTokens: 500, costUsd: 0.75, cacheReadTokens: 100 } })
      fire({ type: 'usage_update', usage: { inputTokens: 2000 } })
      expect(managed.tokenUsage.costUsd).toBe(0.75)
      fire({ type: 'complete', usage: { inputTokens: 2400, outputTokens: 200, costUsd: 0.25 } })
      expect(managed.tokenUsage).toMatchObject({ inputTokens: 2400, outputTokens: 700, totalTokens: 3100, costUsd: 1, cacheReadTokens: 0 })
      expect(events.at(-1).tokenUsage.costUsd).toBe(1)
      await saveSession({ id: managed.id, workspaceRootPath: rootPath, createdAt: 1, lastUsedAt: 1, messages: [], tokenUsage: managed.tokenUsage })
      expect(loadSession(rootPath, managed.id)?.tokenUsage).toEqual(managed.tokenUsage)
    } finally { rmSync(rootPath, { recursive: true, force: true }) }
  })

  it('preserves context occupancy independently of cumulative tokens', () => {
    const { managed, rootPath, fire } = harness()
    try {
      const contextUsage = { usedTokens: 800, limitTokens: 16000, limitKind: 'compaction' as const, isEstimate: true, isStale: false, canCompact: true }
      managed.tokenUsage.contextUsage = contextUsage
      fire({ type: 'complete', usage: { inputTokens: 1000, outputTokens: 500, costUsd: 0.5, contextWindow: 16000 } })
      fire({ type: 'complete', usage: { inputTokens: 200, outputTokens: 100, costUsd: 0.1 } })
      expect(managed.tokenUsage.contextUsage).toBe(contextUsage)
      expect(managed.tokenUsage.outputTokens).toBe(600)
      expect(managed.tokenUsage.contextWindow).toBe(16000)
    } finally { rmSync(rootPath, { recursive: true, force: true }) }
  })

  it('leaves billing unchanged on usage-free completion', () => {
    const { managed, rootPath, fire } = harness()
    try {
      fire({ type: 'complete', usage: { inputTokens: 1000, outputTokens: 300, costUsd: 0.5 } })
      fire({ type: 'complete' })
      expect(managed.tokenUsage).toMatchObject({ outputTokens: 300, costUsd: 0.5 })
    } finally { rmSync(rootPath, { recursive: true, force: true }) }
  })
})
