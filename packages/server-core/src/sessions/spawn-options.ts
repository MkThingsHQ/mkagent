/**
 * What a session spawned with the spawn_session tool inherits from the session that spawned it.
 * Extracted from the SessionManager callback so the inheritance rules are unit-testable.
 */

import type { ThinkingLevel } from '@mkagent/shared/agent/thinking-levels'
import type { CreateSessionOptions } from '@mkagent/shared/protocol'

/** The spawn_session fields that override what the child inherits. */
export interface SpawnOverrides {
  name?: string
  llmConnection?: string
  model?: string
  thinkingLevel?: ThinkingLevel
  workingDirectory?: string
}

/** The spawning session's fields a child inherits. */
export interface SpawnParent {
  id: string
  llmConnection?: string
  model?: string
  thinkingLevel?: ThinkingLevel
  workingDirectory?: string
  codingMode?: boolean
}

/**
 * createSession options for a child of `parent`, without the permission mode and attendance the
 * caller decides. Whatever the request leaves out comes from the parent, so delegated work runs
 * like its parent.
 */
export function spawnedSessionOptions(request: SpawnOverrides, parent: SpawnParent): CreateSessionOptions {
  return {
    name: request.name,
    llmConnection: request.llmConnection ?? parent.llmConnection,
    model: request.model ?? parent.model,
    thinkingLevel: request.thinkingLevel ?? parent.thinkingLevel,
    workingDirectory: request.workingDirectory ?? parent.workingDirectory,
    // The parent's mode both ways, never the workspace default (branches do the same).
    codingMode: parent.codingMode === true,
    // Spawned sessions become subtasks of the spawning session.
    parentSessionId: parent.id,
  }
}
