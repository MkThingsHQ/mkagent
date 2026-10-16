import { describe, it, expect } from 'bun:test'
import { pickCustomSuggestions, newChatSuggestionMentions, pickNewChatSuggestions, newChatSuggestionLabel, newChatSuggestionMessage, NEW_CHAT_SUGGESTION_COUNT } from '../new-chat-suggestions'

describe('Lite new chat suggestions', () => {
  it('offers three source-free starter prompts', () => {
    const suggestions = pickNewChatSuggestions()
    expect(suggestions).toHaveLength(NEW_CHAT_SUGGESTION_COUNT)
    expect(new Set(suggestions.map(item => item.kind)).size).toBe(3)
    expect(suggestions.map(item => Object.keys(item))).toEqual([['kind'], ['kind'], ['kind']])
  })
  it('uses distinct label and prompt keys for every starter', () => {
    const t = (key: string) => key
    for (const suggestion of pickNewChatSuggestions()) {
      expect(newChatSuggestionLabel(suggestion, t)).toBe(`chat.suggestions.${suggestion.kind}`)
      expect(newChatSuggestionMessage(suggestion, t)).toBe(`chat.suggestions.${suggestion.kind}Prompt`)
    }
  })
})

const fakeT = (key: string) => key

describe('custom starters', () => {
  const starters = [
    { label: 'Daily', prompt: 'Run [skill:my-ws:daily] and [skill:daily] with [source:linear]' },
    { label: 'Plain', prompt: 'What is new?' },
    { label: 'Third', prompt: 'Three' },
    { label: 'Extra', prompt: 'Never shown' },
  ]
  it('caps at three and separates label from sent prompt', () => {
    const picks = pickCustomSuggestions(starters)
    expect(picks.map(p => newChatSuggestionLabel(p, fakeT))).toEqual(['Daily', 'Plain', 'Third'])
    expect(newChatSuggestionMessage(picks[0]!, fakeT)).toBe(starters[0]!.prompt)
  })
  it('invokes supported skills without enabling removed Sources', () => {
    expect(newChatSuggestionMentions(pickCustomSuggestions(starters)[0]!, ['daily'])).toEqual(['daily'])
  })
  it('accepts unqualified skills and ignores unknown skills', () => {
    const [pick] = pickCustomSuggestions([{ label: 'Run', prompt: '[skill:daily] [skill:unknown]' }])
    expect(newChatSuggestionMentions(pick!, ['daily'])).toEqual(['daily'])
  })
  it('returns no mentions for automatic and plain starters', () => {
    expect(newChatSuggestionMentions(pickNewChatSuggestions()[0]!, ['daily'])).toEqual([])
    expect(newChatSuggestionMentions(pickCustomSuggestions(starters)[1]!, ['daily'])).toEqual([])
  })
  it('ignores invalid empty manual config entries and falls back on clear', () => {
    expect(pickCustomSuggestions([{ label: ' ', prompt: 'x' }])).toEqual([])
    expect(pickCustomSuggestions([])).toEqual([])
    expect(pickNewChatSuggestions()).toHaveLength(3)
  })
})
