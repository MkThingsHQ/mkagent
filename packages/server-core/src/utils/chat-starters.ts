import type { ChatStarter } from '@mkagent/shared/workspaces/types'

/** Validate at the RPC boundary before changing the persisted workspace config. */
export function validateChatStarters(value: unknown): ChatStarter[] {
  if (!Array.isArray(value) || value.length > 3) throw new Error('chatStarters must be an array of at most 3 starters')
  return value.map(starter => {
    if (!starter || typeof starter.label !== 'string' || !starter.label.trim() || typeof starter.prompt !== 'string' || !starter.prompt.trim()) {
      throw new Error('Each chat starter needs a non-empty label and prompt')
    }
    return { label: starter.label.trim(), prompt: starter.prompt.trim() }
  })
}
