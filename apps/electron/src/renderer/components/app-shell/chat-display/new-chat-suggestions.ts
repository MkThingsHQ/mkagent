export type NewChatSuggestionKind = 'news' | 'files' | 'skills'
export interface NewChatSuggestion { kind: NewChatSuggestionKind }
export const NEW_CHAT_SUGGESTION_COUNT = 3
export function pickNewChatSuggestions(): NewChatSuggestion[] { return [{ kind: 'news' }, { kind: 'files' }, { kind: 'skills' }] }
type Translate = (key: string, options?: Record<string, string>) => string
export function newChatSuggestionLabel(suggestion: NewChatSuggestion, t: Translate): string { return t(`chat.suggestions.${suggestion.kind}`) }
export function newChatSuggestionMessage(suggestion: NewChatSuggestion, t: Translate): string { return t(`chat.suggestions.${suggestion.kind}Prompt`) }
