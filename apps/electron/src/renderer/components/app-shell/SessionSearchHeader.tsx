import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { Spinner } from '@mkagent/ui'

/**
 * SessionSearchHeader - Presentational component for session list search UI.
 *
 * Renders:
 * - Search input with static search icon
 * - Status row showing "Loading…" or "{count} results" when query is active
 *
 * This component is shared between the main app (SessionList) and the playground.
 */

export interface SessionSearchHeaderProps {
  /** Current search query value */
  searchQuery: string
  /** Called when search query changes */
  onSearchChange?: (query: string) => void
  /** Called when search is closed (X button) */
  onSearchClose?: () => void
  /** Called on keydown in the search input */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  /** Called when input gains focus */
  onFocus?: () => void
  /** Called when input loses focus */
  onBlur?: () => void
  /** Whether content search is in progress */
  isSearching?: boolean
  /** Whether the search service is unavailable (e.g. ripgrep not found) */
  isUnavailable?: boolean
  /** Number of results to display (when not searching) */
  resultCount?: number
  /** Whether the result count exceeded the display limit (shows "100+" instead of exact count) */
  exceededLimit?: boolean
  /** Ref for the input element (for focus management) */
  inputRef?: React.RefObject<HTMLInputElement>
  /** Placeholder text */
  placeholder?: string
  /** Whether the input is read-only (for playground demos) */
  readOnly?: boolean
}

export function SessionSearchHeader({
  searchQuery,
  onSearchChange,
  onSearchClose,
  onKeyDown,
  onFocus,
  onBlur,
  isSearching = false,
  isUnavailable = false,
  resultCount,
  exceededLimit = false,
  inputRef,
  placeholder = 'Search titles and content...',
  readOnly = false,
}: SessionSearchHeaderProps) {
  const { t } = useTranslation()
  return (
    <div className="shrink-0 px-2 pt-1 pb-2">
      {/* Search input — sunken field with the focus tint (field-surface) */}
      <div className="field-surface relative rounded-md">
        {/* Search icon - always static, never changes to spinner */}
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-tertiary" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange?.(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          readOnly={readOnly}
          placeholder={placeholder}
          className="w-full h-control-lg pl-8 pr-8 text-label bg-transparent border-0 rounded-md outline-none placeholder:text-tertiary"
        />
        {onSearchClose && (
          <button
            type="button"
            onClick={onSearchClose}
            className="absolute right-1 top-1/2 -translate-y-1/2 inline-grid place-items-center size-6 rounded-sm text-tertiary hover:bg-fill-hover hover:text-foreground"
            title={t("session.closeSearch")}
            aria-label={t("session.closeSearch")}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Search status row - shown when search mode is active (2+ characters) */}
      {searchQuery.length >= 2 && (
        <div className="px-2 pt-2 flex items-center gap-1.5 text-label-sm text-tertiary">
          {isSearching ? (
            <>
              <Spinner className="text-caption text-tertiary" />
              <span>{t('common.loading')}</span>
            </>
          ) : isUnavailable ? (
            <span className="text-destructive">{t('session.searchUnavailable')}</span>
          ) : (
            <span>{t('session.results', { count: exceededLimit ? '100+' : (resultCount ?? 0) })}</span>
          )}
        </div>
      )}
    </div>
  )
}
