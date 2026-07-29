import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { getSessionFilePath, writeSessionJsonl, type StoredSession } from '@mkagent/shared/sessions'
import { SessionManager, createManagedSession } from './SessionManager.ts'

describe('cold-session metadata persistence', () => {
  let root: string
  let manager: SessionManager

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'mkagent-cold-meta-')); manager = new SessionManager() })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  function seed(id: string) {
    const path = getSessionFilePath(root, id)
    mkdirSync(dirname(path), { recursive: true })
    const stored: StoredSession = {
      id,
      workspaceRootPath: root,
      name: 'Before',
      createdAt: 1,
      lastUsedAt: 2,
      messages: [{ id: 'm1', type: 'user', content: 'keep me', timestamp: 3 }],
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextTokens: 0, costUsd: 0 },
    }
    writeSessionJsonl(path, stored)
    const workspace = { id: 'ws', name: 'Workspace', slug: 'workspace', rootPath: root, createdAt: 1 }
    const managed = createManagedSession(stored, workspace as never, { messagesLoaded: false })
    ;(manager as unknown as { sessions: Map<string, unknown> }).sessions.set(id, managed)
    return path
  }

  it('renames a cold session without erasing its messages', async () => {
    const path = seed('cold-rename')
    await manager.renameSession('cold-rename', 'After')
    await manager.flushSession('cold-rename')
    const lines = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(lines[0].name).toBe('After')
    expect(lines.slice(1).map(line => line.id)).toEqual(['m1'])
  })

  it('flags a cold session without erasing its messages', async () => {
    const path = seed('cold-flag')
    await manager.flagSession('cold-flag')
    await manager.flushSession('cold-flag')
    const lines = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(lines[0].isFlagged).toBe(true)
    expect(lines.slice(1).map(line => line.id)).toEqual(['m1'])
  })

  it('returns header-derived sidebar metadata before messages are loaded', () => {
    const workspace = { id: 'ws', name: 'Workspace', slug: 'workspace', rootPath: root, createdAt: 1 }
    const managed = createManagedSession({
      id: 'cold-list',
      workspaceRootPath: root,
      createdAt: 1,
      lastUsedAt: 2,
      lastMessageAt: 3,
      preview: 'first user request',
      messageCount: 7,
      lastMessageRole: 'assistant',
      lastFinalMessageId: 'assistant-3',
      tokenUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, contextTokens: 1, costUsd: 0 },
    }, workspace as never, { messagesLoaded: false })
    ;(manager as unknown as { sessions: Map<string, unknown> }).sessions.set(managed.id, managed)

    expect(manager.getSessions('ws')[0]).toMatchObject({
      preview: 'first user request',
      messageCount: 7,
      lastMessageRole: 'assistant',
      lastFinalMessageId: 'assistant-3',
    })
  })
})
