import { describe, expect, it } from 'bun:test'
import { SessionManager, createManagedSession } from './SessionManager.ts'

describe('SessionManager.respondToCredential auth cancellation', () => {
  it('cancels a pending OAuth request through the unified AuthRequestCard response path', async () => {
    const manager = new SessionManager()
    const workspace = {
      id: 'ws_auth_cancel',
      name: 'Auth Cancel',
      rootPath: '/tmp/mkagent-auth-cancel',
      createdAt: Date.now(),
    }
    const managed = createManagedSession({ id: 'session_auth_cancel' }, workspace as never, { messagesLoaded: true })
    managed.pendingAuthRequestId = 'request_oauth'
    managed.pendingAuthRequest = {
      requestId: 'request_oauth',
      type: 'oauth',
      sessionId: managed.id,
      sourceSlug: 'linear',
      sourceName: 'Linear',
    }
    managed.messages.push({
      id: 'auth_message',
      role: 'auth-request',
      content: 'Authenticate Linear',
      timestamp: Date.now(),
      authRequestId: 'request_oauth',
      authStatus: 'pending',
    })

    ;(manager as unknown as { sessions: Map<string, unknown> }).sessions.set(managed.id, managed)
    ;(manager as unknown as { flushSession: () => Promise<void> }).flushSession = async () => {}
    ;(manager as unknown as { sendMessage: () => Promise<void> }).sendMessage = async () => {}

    const delivered = await manager.respondToCredential(managed.id, 'request_oauth', { type: 'credential', cancelled: true })

    expect(delivered).toBe(true)
    expect(managed.pendingAuthRequest).toBeUndefined()
    expect(managed.messages[0]?.authStatus).toBe('cancelled')
  })
})
