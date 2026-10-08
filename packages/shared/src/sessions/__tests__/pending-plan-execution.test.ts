import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { StoredSession } from '../types.ts'
import {
  clearPendingPlanExecution,
  getPendingPlanExecution,
  getSessionFilePath,
  markCompactionComplete,
  markPendingPlanExecutionDispatched,
  saveSession,
  setPendingPlanExecution,
} from '../storage.ts'

function makeTmpDir(): string {
  const dir = join(tmpdir(), `pending-plan-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeStoredSession(workspaceRootPath: string): StoredSession {
  return {
    id: 'session-1',
    workspaceRootPath,
    createdAt: 1000,
    lastUsedAt: 1000,
    messages: [],
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      contextTokens: 0,
      costUsd: 0,
    },
  } as StoredSession
}

describe('pending plan execution persistence', () => {
  let workspaceRoot: string

  beforeEach(async () => {
    workspaceRoot = makeTmpDir()
    await saveSession(makeStoredSession(workspaceRoot))
  })

  afterEach(() => {
    if (existsSync(workspaceRoot)) {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it('defaults executionDispatched to false and persists transitions', async () => {
    await setPendingPlanExecution(workspaceRoot, 'session-1', '/tmp/plan.md', 'draft snapshot')

    expect(getPendingPlanExecution(workspaceRoot, 'session-1')).toEqual({
      planPath: '/tmp/plan.md',
      draftInputSnapshot: 'draft snapshot',
      awaitingCompaction: true,
      executionDispatched: false,
    })

    expect(await markPendingPlanExecutionDispatched(workspaceRoot, 'session-1')).toBe(false)
    await markCompactionComplete(workspaceRoot, 'session-1')
    expect(await markPendingPlanExecutionDispatched(workspaceRoot, 'session-1')).toBe(true)
    expect(await markPendingPlanExecutionDispatched(workspaceRoot, 'session-1')).toBe(false)

    expect(getPendingPlanExecution(workspaceRoot, 'session-1')).toEqual({
      planPath: '/tmp/plan.md',
      draftInputSnapshot: 'draft snapshot',
      awaitingCompaction: false,
      executionDispatched: true,
    })
  })

  it('clears a pending plan, and leaves the file alone when nothing is pending', async () => {
    const path = getSessionFilePath(workspaceRoot, 'session-1')
    const untouched = statSync(path).mtimeMs
    await new Promise(resolve => setTimeout(resolve, 15))
    // Runs on every user message: no rewrite (concurrent sends used to race on the .tmp file).
    await Promise.all([
      clearPendingPlanExecution(workspaceRoot, 'session-1'),
      clearPendingPlanExecution(workspaceRoot, 'session-1'),
    ])
    expect(statSync(path).mtimeMs).toBe(untouched)

    await setPendingPlanExecution(workspaceRoot, 'session-1', '/tmp/plan.md')
    await clearPendingPlanExecution(workspaceRoot, 'session-1')
    expect(getPendingPlanExecution(workspaceRoot, 'session-1')).toBeNull()
  })
})
