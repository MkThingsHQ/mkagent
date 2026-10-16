import { describe, it, expect } from 'bun:test'
import { pickNewChatSuggestions, newChatSuggestionLabel, newChatSuggestionMessage, NEW_CHAT_SUGGESTION_COUNT } from '../new-chat-suggestions'

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
