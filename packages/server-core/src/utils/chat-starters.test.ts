import { describe, expect, it } from 'bun:test'
import { validateChatStarters } from './chat-starters'

describe('workspace chat starter validation', () => {
  it('trims separate label and prompt and permits clearing', () => {
    expect(validateChatStarters([{ label: ' Daily ', prompt: ' Run [skill:ws:daily] ' }])).toEqual([{ label: 'Daily', prompt: 'Run [skill:ws:daily]' }])
    expect(validateChatStarters([])).toEqual([])
  })
  it('rejects invalid payloads before workspace mutation', () => {
    for (const invalid of [null, {}, 'text', [null], [{ label: '', prompt: 'x' }], [{ label: 'x', prompt: ' ' }], [{ label: 2, prompt: 'x' }], Array(4).fill({ label: 'x', prompt: 'x' })]) {
      expect(() => validateChatStarters(invalid)).toThrow()
    }
  })
})
