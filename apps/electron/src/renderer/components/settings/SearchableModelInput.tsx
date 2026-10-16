/**
 * SearchableModelInput
 *
 * Input field with a dropdown button that shows a searchable list of models.
 * Used for custom model name configuration in API settings.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@mkagent/ui'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface ModelOption {
  id: string
  name?: string
}

export interface SearchableModelInputProps {
  /** Current value */
  value: string
  /** Change handler */
  onChange: (value: string) => void
  /** Blur handler (for saving) */
  onBlur?: () => void
  /** Placeholder text */
  placeholder?: string
  /** Available models to choose from */
  models: ModelOption[]
  /** Whether models are currently being fetched */
  isLoading?: boolean
  /** Handler to fetch models (called when dropdown button is clicked) */
  onFetchModels?: () => void
  /** Whether fetch button should be disabled */
  fetchDisabled?: boolean
  /** Additional className */
  className?: string
}

export function SearchableModelInput({
  value,
  onChange,
  onBlur,
  placeholder = 'e.g., claude-sonnet-4-6',
  models,
  isLoading,
  onFetchModels,
  fetchDisabled,
  className,
}: SearchableModelInputProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  // Filter models based on search query
  const filteredModels = React.useMemo(() => {
    if (!searchQuery.trim()) return models
    const query = searchQuery.toLowerCase()
    return models.filter(
      (model) =>
        model.id.toLowerCase().includes(query) ||
        model.name?.toLowerCase().includes(query)
    )
  }, [models, searchQuery])

  const handleSelect = (modelId: string) => {
    onChange(modelId)
    setIsOpen(false)
    setSearchQuery('')
    onBlur?.()
  }

  const handleFetchClick = async () => {
    if (onFetchModels) {
      await onFetchModels()
      setIsOpen(true)
      // Focus search input after models load
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      setSearchQuery('')
    } else if (models.length > 0) {
      // Focus search input when opening
      setTimeout(() => searchInputRef.current?.focus(), 0)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="pr-12"
      />
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="icon-sm"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={handleFetchClick}
            disabled={fetchDisabled || isLoading}
            aria-label={t("apiSetup.searchModels")}
          >
            {isLoading ? <Spinner className="text-label-sm" /> : <ChevronDown aria-hidden />}
          </Button>
        </PopoverTrigger>
        {models.length > 0 && (
          <PopoverContent
            align="end"
            sideOffset={4}
            collisionPadding={8}
            className="p-1 w-[var(--radix-popover-trigger-width)]"
            style={{ minWidth: 280 }}
          >
            {/* Search input */}
            <div className="relative mb-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-tertiary" aria-hidden />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("apiSetup.searchModels")}
                aria-label={t("apiSetup.searchModels")}
                className="field-surface h-control-lg w-full rounded-md pl-8 pr-3 text-label"
              />
            </div>
            {/* Model list */}
            <div className="max-h-64 overflow-auto space-y-px">
              {filteredModels.length === 0 ? (
                <div className="px-2.5 py-3 text-center text-label text-tertiary">
                  No models found
                </div>
              ) : (
                filteredModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    className={cn(
                      'flex min-h-row-menu w-full items-center rounded-md px-2 py-1.5 text-left text-label -outline-offset-2',
                      'transition-colors duration-micro ease-out-subtle hover:bg-fill-hover hover:duration-instant',
                      value === model.id && 'bg-fill-selected'
                    )}
                    onClick={() => handleSelect(model.id)}
                  >
                    {model.name || model.id}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        )}
      </Popover>
    </div>
  )
}
