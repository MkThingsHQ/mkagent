/**
 * SettingsRadioGroup & SettingsRadioCard
 *
 * Full-width radio card selection pattern (Amie-style).
 * Each option is a separate card with radio indicator on the left.
 */

import * as React from 'react'
import { AnimatedCollapsibleContent } from '@mkagent/ui'
import { cn } from '@/lib/utils'
import { settingsUI } from './SettingsUIConstants'
import { SettingsCardDivider } from './SettingsCard'

// ============================================
// Context
// ============================================

interface RadioGroupContextValue {
  value: string
  onValueChange: (value: string) => void
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null)

function useRadioGroupContext() {
  return React.useContext(RadioGroupContext)
}

/** Radio dot: --border-control ring when off (≥ 3:1), accent fill with an on-accent dot when on. */
function RadioIndicator({ selected, className }: { selected: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-full',
        selected ? 'bg-accent-solid' : 'inset-ring-[1.5px] inset-ring-[var(--border-control)]',
        className
      )}
    >
      {selected && <span className="size-1.5 rounded-full bg-on-accent" />}
    </span>
  )
}

// ============================================
// SettingsRadioGroup
// ============================================

export interface SettingsRadioGroupProps<T extends string = string> {
  /** Currently selected value */
  value: T
  /** Change handler */
  onValueChange: (value: T) => void
  /** Radio cards */
  children: React.ReactNode
  /** Additional className */
  className?: string
}

/**
 * SettingsRadioGroup - Container for radio card options
 *
 * @example
 * <SettingsRadioGroup value={model} onValueChange={setModel}>
 *   <SettingsRadioCard value="opus" label="Opus 4.8" description="Most capable" />
 *   <SettingsRadioCard value="sonnet" label="Sonnet 4.6" description="Balanced" />
 * </SettingsRadioGroup>
 */
export function SettingsRadioGroup<T extends string = string>({
  value,
  onValueChange,
  children,
  className,
}: SettingsRadioGroupProps<T>) {
  const childArray = React.Children.toArray(children).filter(Boolean)

  return (
    <RadioGroupContext.Provider
      value={{
        value,
        onValueChange: onValueChange as (value: string) => void,
      }}
    >
      <div
        role="radiogroup"
        className={cn(
          'rounded-lg bg-raised shadow-elev-1 overflow-hidden',
          className
        )}
      >
        {childArray.map((child, index) => (
          <React.Fragment key={index}>
            {index > 0 && <SettingsCardDivider />}
            {child}
          </React.Fragment>
        ))}
      </div>
    </RadioGroupContext.Provider>
  )
}

// ============================================
// SettingsRadioCard
// ============================================

export interface SettingsRadioCardProps {
  /** Value for this option */
  value: string
  /** Option label */
  label: string
  /** Optional description below label */
  description?: string
  /** Optional icon on the right */
  icon?: React.ReactNode
  /** Optional badge (e.g., "Active", "Beta") */
  badge?: React.ReactNode
  /** Disabled state */
  disabled?: boolean
  /** Content to show when this option is selected */
  expandedContent?: React.ReactNode
  /** Additional className */
  className?: string
  /** Standalone mode: whether this option is selected (use instead of RadioGroup) */
  selected?: boolean
  /** Standalone mode: click handler (use instead of RadioGroup) */
  onClick?: () => void
  /** When true, disables card styling (use when inside a SettingsCard) */
  inCard?: boolean
}

/**
 * SettingsRadioCard - Full-width radio option card
 *
 * @example
 * <SettingsRadioCard
 *   value="api_key"
 *   label="API Key"
 *   description="Pay-as-you-go with your Anthropic key"
 *   expandedContent={<ApiKeyInput />}
 * />
 */
export function SettingsRadioCard({
  value,
  label,
  description,
  icon,
  badge,
  disabled,
  expandedContent,
  className,
  selected,
  onClick,
  inCard,
}: SettingsRadioCardProps) {
  const context = useRadioGroupContext()
  // Support both context-based and standalone usage
  const isSelected = context ? context.value === value : (selected ?? false)
  const handleClick = context ? () => context.onValueChange(value) : onClick
  const id = React.useId()

  // Apply card styling only in standalone mode and not inside a SettingsCard
  const needsCardStyling = !context && !inCard

  return (
    <div
      className={cn(
        'overflow-hidden transition-colors duration-micro ease-out-subtle',
        needsCardStyling && 'rounded-lg bg-raised shadow-elev-1',
        !disabled && 'hover:bg-fill-hover hover:duration-instant',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <button
        type="button"
        role="radio"
        id={id}
        aria-checked={isSelected}
        disabled={disabled}
        onClick={() => !disabled && handleClick?.()}
        className={cn(
          'w-full px-3.5 py-3 text-left flex items-start gap-3 -outline-offset-2',
          !disabled && 'cursor-pointer'
        )}
      >
        {/* Radio circle */}
        <RadioIndicator selected={isSelected} className="mt-px" />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={settingsUI.label}>{label}</span>
            {badge}
          </div>
          {description && (
            <div className={cn(settingsUI.description, settingsUI.labelDescriptionGap)}>
              {description}
            </div>
          )}
        </div>

        {/* Right icon */}
        {icon && <div className="shrink-0 ml-2">{icon}</div>}
      </button>

      {/* Expanded content: swaps in once and fades with a 4px drop (no height animation) */}
      <AnimatedCollapsibleContent isOpen={isSelected && !!expandedContent}>
        <div className="px-3.5 pb-3.5 pt-0">
          <div className="pl-7">{expandedContent}</div>
        </div>
      </AnimatedCollapsibleContent>
    </div>
  )
}

// ============================================
// SettingsRadioOption (Simpler inline variant)
// ============================================

export interface SettingsRadioOptionProps {
  /** Value for this option */
  value: string
  /** Option label */
  label: string
  /** Optional description (inline, after separator) */
  description?: string
  /** Disabled state */
  disabled?: boolean
  /** Additional className */
  className?: string
}

/**
 * SettingsRadioOption - Simple inline radio option (no card background)
 *
 * Use inside a SettingsCard for grouped options without individual backgrounds.
 */
export function SettingsRadioOption({
  value,
  label,
  description,
  disabled,
  className,
}: SettingsRadioOptionProps) {
  const context = useRadioGroupContext()
  if (!context) {
    throw new Error('SettingsRadioOption must be used within SettingsRadioGroup')
  }
  const { value: selectedValue, onValueChange } = context
  const isSelected = selectedValue === value
  const id = React.useId()

  return (
    <button
      type="button"
      role="radio"
      id={id}
      aria-checked={isSelected}
      disabled={disabled}
      onClick={() => !disabled && onValueChange(value)}
      className={cn(
        'w-full min-h-11 px-3.5 py-2.5 text-left flex items-center gap-3 -outline-offset-2',
        'transition-colors duration-micro ease-out-subtle hover:bg-fill-hover hover:duration-instant',
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'cursor-pointer',
        className
      )}
    >
      {/* Radio circle */}
      <RadioIndicator selected={isSelected} />

      {/* Label */}
      <div className="flex-1 min-w-0 flex items-center">
        <span className="text-label">{label}</span>
        {description && (
          <span className="text-label text-tertiary ml-1.5">
            · {description}
          </span>
        )}
      </div>
    </button>
  )
}
