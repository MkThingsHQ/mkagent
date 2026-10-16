import { CalendarDays, CircleDot, FileText, FolderOpen, GitPullRequest, Lightbulb, ListTodo, Mail, MailPlus, MessageSquare, Newspaper, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { newChatSuggestionLabel, type NewChatSuggestion, type NewChatSuggestionKind } from './new-chat-suggestions'

const KIND_ICONS: Record<NewChatSuggestionKind, LucideIcon> = { news: Newspaper, files: FolderOpen, skills: Lightbulb }

/** Starter prompt chips under the new-chat question; a click sends the prompt. */
export function NewChatSuggestions({ suggestions, onSelect }: {
  suggestions: NewChatSuggestion[]
  onSelect: (suggestion: NewChatSuggestion) => void
}) {
  const { t } = useTranslation()
  if (suggestions.length === 0) return null
  return (
    <div role="group" aria-label={t('chat.suggestions.label')} className="flex max-w-xl flex-wrap justify-center gap-2">
      {suggestions.map((suggestion) => {
        const Icon = KIND_ICONS[suggestion.kind]
        const label = newChatSuggestionLabel(suggestion, (key, options) => t(key, options))
        return (
          <button
            key={suggestion.kind}
            type="button"
            onClick={() => onSelect(suggestion)}
            title={label}
            className="motion-press inline-flex h-control-lg max-w-full items-center gap-2 rounded-full border border-default bg-paper px-3.5 text-label text-secondary hover:bg-fill-hover hover:text-foreground active:bg-fill-pressed"
          >
            <Icon aria-hidden className="size-4 shrink-0 text-tertiary" />
            <span className="truncate">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
