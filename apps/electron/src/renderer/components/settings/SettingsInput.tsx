/**
 * SettingsInput
 *
 * Text input with label for settings pages.
 * Supports password type with show/hide toggle.
 * Fields use the Input primitive's sunken well (field-surface): hairline, focus-ring tint,
 * destructive ring when invalid.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { settingsUI } from './SettingsUIConstants'

/** Eye button inside a password field (pointer-only, like before: tabIndex -1). */
function RevealButton({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={revealed ? t('common.hide') : t('common.show')}
      className="absolute right-1.5 top-1/2 inline-grid size-6 -translate-y-1/2 place-items-center rounded-sm text-tertiary transition-colors duration-micro ease-out-subtle hover:text-secondary hover:duration-instant"
      tabIndex={-1}
    >
      {revealed ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
    </button>
  )
}

export interface SettingsInputProps {
  /** Input label */
  label?: string
  /** Optional description below label */
  description?: string
  /** Current value */
  value: string
  /** Change handler */
  onChange: (value: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Input type */
  type?: 'text' | 'password' | 'email' | 'url'
  /** Disabled state */
  disabled?: boolean
  /** Error message */
  error?: string
  /** Action button next to input */
  action?: React.ReactNode
  /** Additional className */
  className?: string
  /** Whether inside a card */
  inCard?: boolean
  /** onBlur handler */
  onBlur?: () => void
  /** onKeyDown handler */
  onKeyDown?: (e: React.KeyboardEvent) => void
}

/**
 * SettingsInput - Text input with label
 *
 * @example
 * <SettingsInput
 *   label="Name"
 *   value={name}
 *   onChange={setName}
 *   placeholder="Enter your name..."
 * />
 */
export function SettingsInput({
  label,
  description,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  error,
  action,
  className,
  inCard = false,
  onBlur,
  onKeyDown,
}: SettingsInputProps) {
  const id = React.useId()
  const [showPassword, setShowPassword] = React.useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword && showPassword ? 'text' : type

  return (
    <div
      className={cn(
        'space-y-2',
        inCard && settingsUI.cardPadding,
        className
      )}
    >
      {label && (
        <div className={settingsUI.labelGroup}>
          <Label htmlFor={id} className={settingsUI.label}>
            {label}
          </Label>
          {description && (
            <p className={cn(settingsUI.description, settingsUI.labelDescriptionGap)}>{description}</p>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Input
            id={id}
            type={inputType}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            aria-invalid={error ? true : undefined}
            className={cn(isPassword && 'pr-9')}
          />
          {isPassword && (
            <RevealButton revealed={showPassword} onToggle={() => setShowPassword(!showPassword)} />
          )}
        </div>
        {action}
      </div>
      {error && <p className="text-label-sm text-destructive">{error}</p>}
    </div>
  )
}

/**
 * SettingsInputRow - Inline input with label on left
 *
 * For settings where the input should be on the right side
 */
export interface SettingsInputRowProps {
  /** Row label */
  label: string
  /** Optional description below label */
  description?: string
  /** Current value */
  value: string
  /** Change handler */
  onChange: (value: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Input type */
  type?: 'text' | 'password' | 'email' | 'url'
  /** Disabled state */
  disabled?: boolean
  /** Error message */
  error?: string
  /** Additional className */
  className?: string
  /** Whether inside a card */
  inCard?: boolean
}

export function SettingsInputRow({
  label,
  description,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  error,
  className,
  inCard = true,
}: SettingsInputRowProps) {
  const id = React.useId()

  return (
    <div
      data-layout="settings-row"
      className={cn(
        'flex items-center justify-between',
        inCard ? settingsUI.row : settingsUI.rowBare,
        className
      )}
    >
      <div className="flex-1 min-w-0">
        <Label htmlFor={id} className={settingsUI.label}>
          {label}
        </Label>
        {description && (
          <p className={cn(settingsUI.description, settingsUI.labelDescriptionGap)}>{description}</p>
        )}
        {error && <p className={cn('text-label-sm text-destructive', settingsUI.labelDescriptionGap)}>{error}</p>}
      </div>
      {/* `w-[200px]` is a hook for the @container panel stacking rule in index.css */}
      <div data-layout="settings-control" className="shrink-0">
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          className="w-[200px]"
        />
      </div>
    </div>
  )
}

/**
 * SettingsSecretInput - Password input with show/hide and optional validation
 *
 * Specialized for API keys, tokens, etc.
 */
export interface SettingsSecretInputProps {
  /** Input label */
  label?: string
  /** Optional description */
  description?: string
  /** Current value */
  value: string
  /** Change handler */
  onChange: (value: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Disabled state */
  disabled?: boolean
  /** Error message */
  error?: string
  /** Additional className */
  className?: string
  /** Whether inside a card */
  inCard?: boolean
  /** onBlur handler */
  onBlur?: () => void
}

export function SettingsSecretInput({
  label,
  description,
  value,
  onChange,
  placeholder = 'Enter value...',
  disabled,
  error,
  className,
  inCard = false,
  onBlur,
}: SettingsSecretInputProps) {
  const id = React.useId()
  const [showValue, setShowValue] = React.useState(false)

  return (
    <div
      className={cn(
        'space-y-2',
        inCard && settingsUI.cardPadding,
        className
      )}
    >
      {label && (
        <div className={settingsUI.labelGroup}>
          <Label htmlFor={id} className={settingsUI.label}>
            {label}
          </Label>
          {description && (
            <p className={cn(settingsUI.description, settingsUI.labelDescriptionGap)}>{description}</p>
          )}
        </div>
      )}
      <div className="relative">
        <Input
          id={id}
          type={showValue ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          className="pr-9"
        />
        <RevealButton revealed={showValue} onToggle={() => setShowValue(!showValue)} />
      </div>
      {error && <p className="text-label-sm text-destructive">{error}</p>}
    </div>
  )
}
