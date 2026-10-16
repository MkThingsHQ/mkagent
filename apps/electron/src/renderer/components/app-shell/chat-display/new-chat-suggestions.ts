import { parseMentions } from '@mkagent/shared/mentions'
import type { ChatStarter } from '@mkagent/shared/workspaces/types'

export type NewChatSuggestionKind = 'news' | 'files' | 'skills' | 'custom'
export interface NewChatSuggestion { kind: NewChatSuggestionKind; customLabel?: string; customPrompt?: string }
export const NEW_CHAT_SUGGESTION_COUNT = 3
export function pickNewChatSuggestions(): NewChatSuggestion[] { return [{ kind: 'news' }, { kind: 'files' }, { kind: 'skills' }] }
export function pickCustomSuggestions(starters: ChatStarter[]): NewChatSuggestion[] {
  return starters.filter(s => typeof s.label === 'string' && s.label.trim() && typeof s.prompt === 'string' && s.prompt.trim())
    .slice(0, NEW_CHAT_SUGGESTION_COUNT).map(s => ({ kind: 'custom', customLabel: s.label, customPrompt: s.prompt }))
}
export function newChatSuggestionMentions(suggestion: NewChatSuggestion, skills: string[]): string[] {
  return parseMentions(suggestion.customPrompt ?? '', skills).skills
}
type Translate = (key: string, options?: Record<string, string>) => string
export function newChatSuggestionLabel(suggestion: NewChatSuggestion, t: Translate): string { return suggestion.kind === 'custom' ? suggestion.customLabel ?? '' : t(`chat.suggestions.${suggestion.kind}`) }
export function newChatSuggestionMessage(suggestion: NewChatSuggestion, t: Translate): string { return suggestion.kind === 'custom' ? suggestion.customPrompt ?? '' : t(`chat.suggestions.${suggestion.kind}Prompt`) }
