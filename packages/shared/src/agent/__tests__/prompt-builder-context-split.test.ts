/**
 * Guards the volatile/stable context split (issue #862).
 *
 * The Pi adapter folded volatile context (date/time and session_state)
 * into the cached system prefix, re-stamping it every turn and killing
 * prompt-cache reuse. The fix splits PromptBuilder.buildContextParts() into
 * buildVolatileContextParts() + buildStableContextParts() so the Pi path can
 * keep stable blocks in the system prompt and route volatile blocks to the user
 * tail.
 *
 * These tests pin three invariants:
 *  1. buildContextParts === [...volatile, ...stable].
 *  2. Blocks are routed correctly: session_state is volatile;
 *     workspace capabilities is stable.
 *  3. The one-shot mode-change signal is consumed exactly once, and only by the
 *     volatile builder — never by the stable builder.
 */
import { describe, it, expect, afterEach } from 'bun:test'
import { createMockSession, createMockWorkspace } from './test-utils.ts'
import { PromptBuilder } from '../core/prompt-builder.ts'
import { cleanupModeState, initializeModeState, setPermissionMode } from '../mode-manager.ts'

// Matches createMockSession() in test-utils.ts
const SESSION_ID = 'test-session-id'
const OPTS = { plansFolderPath: '/tmp/plans', dataFolderPath: '/tmp/data' }

function makeBuilder() {
  return new PromptBuilder({
    workspace: createMockWorkspace(),
    session: createMockSession(),
    isHeadless: true,
  })
}

describe('PromptBuilder volatile/stable context split (issue #862)', () => {
  afterEach(() => cleanupModeState(SESSION_ID))

  it('buildContextParts equals [...volatile, ...stable]', () => {
    // No pending one-shot signal → consume is a no-op → repeated calls are stable.
    cleanupModeState(SESSION_ID)
    const builder = makeBuilder()
    const composed = [
      ...builder.buildVolatileContextParts(OPTS),
      ...builder.buildStableContextParts(),
    ]
    const combined = builder.buildContextParts(OPTS)
    expect(combined).toEqual(composed)
  })

  it('routes session_state to volatile and workspace capabilities to stable', () => {
    cleanupModeState(SESSION_ID)
    const builder = makeBuilder()
    const volatileText = builder.buildVolatileContextParts(OPTS).join('\n')
    const stableText = builder.buildStableContextParts().join('\n')

    // session_state rides the volatile tail
    expect(volatileText).toContain('permissionMode:')
    // workspace capabilities is stable
    expect(stableText).toContain('<workspace_capabilities>')

    // The halves must not bleed into each other
    expect(volatileText).not.toContain('<workspace_capabilities>')
    expect(stableText).not.toContain('permissionMode:')
  })

  it('consumes the one-shot mode-change signal exactly once, only on the volatile path', () => {
    initializeModeState(SESSION_ID, 'safe')
    setPermissionMode(SESSION_ID, 'allow-all', {
      changedBy: 'user',
      changedAt: '2026-03-02T10:00:00.000Z',
    })
    const builder = makeBuilder()

    // Stable path never touches the one-shot signal.
    expect(builder.buildStableContextParts().join('\n')).not.toContain('modeChangeUserSignal:')

    // Volatile path emits it on the first call, then never again.
    const first = builder.buildVolatileContextParts(OPTS).join('\n')
    const second = builder.buildVolatileContextParts(OPTS).join('\n')
    expect(first).toContain('modeChangeUserSignal:')
    expect(second).not.toContain('modeChangeUserSignal:')
  })
})
