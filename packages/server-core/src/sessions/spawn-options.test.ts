import { describe, expect, it } from 'bun:test'
import { spawnedSessionOptions, type SpawnParent } from './spawn-options.ts'

const parent: SpawnParent = {
  id: 'parent',
  llmConnection: 'anthropic',
  model: 'claude-opus-5-5',
  thinkingLevel: 'high',
  workingDirectory: '/repos/app-feature',
  codingMode: true,
}

describe('spawnedSessionOptions', () => {
  it('inherits everything the request leaves out, the folder and Coding mode included', () => {
    expect(spawnedSessionOptions({ name: 'child' }, parent)).toEqual({
      name: 'child',
      llmConnection: 'anthropic',
      model: 'claude-opus-5-5',
      thinkingLevel: 'high',
      workingDirectory: '/repos/app-feature',
      codingMode: true,
      parentSessionId: 'parent',
    })
  })

  it('lets the request override the model and working folder', () => {
    expect(spawnedSessionOptions({ model: 'small', workingDirectory: '/repos/child' }, parent)).toMatchObject({ model: 'small', workingDirectory: '/repos/child' })
  })

  it('keeps a default-mode parent\'s child out of Coding mode even where the workspace default is on', () => {
    // false (not undefined) so createSession doesn't fall back to the workspace default
    expect(spawnedSessionOptions({}, { ...parent, codingMode: undefined }).codingMode).toBe(false)
    expect(spawnedSessionOptions({}, { ...parent, codingMode: false }).codingMode).toBe(false)
  })
})
