import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, FileText, GitBranch, Maximize2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '../../ui/StyledDropdown'
import { TurnIconButton } from './TurnIconButton'
import { HOVER_REVEAL } from './turn-classes'

interface BranchDropdownProps {
  onBranch: (options?: { newPanel?: boolean }) => void
}

/** Branch trigger (icon button) + its one-item menu, same action as before. */
export function BranchDropdown({ onBranch }: BranchDropdownProps) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <TurnIconButton
              aria-label={t('chat.branchOptions')}
              icon={<GitBranch />}
              className="turn-action-btn select-none"
            />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('chat.branch')}</TooltipContent>
      </Tooltip>

      <StyledDropdownMenuContent align="end" minWidth="min-w-64" sideOffset={6}>
        <StyledDropdownMenuItem onClick={() => onBranch({ newPanel: true })} className="items-start py-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-label">{t('chat.branchFromThisMessage')}</span>
            <span className="max-w-[220px] whitespace-normal text-label-sm text-tertiary">
              {t('chat.branchFromThisMessageDescription')}
            </span>
          </div>
        </StyledDropdownMenuItem>
      </StyledDropdownMenuContent>
    </DropdownMenu>
  )
}

export interface ResponseFooterProps {
  /** Whether the copy action just succeeded (shows ✓ for 2s) */
  copied: boolean
  onCopy: () => void
  /** Open the raw markdown in the code viewer */
  onPopOut?: () => void
  /** Open the fullscreen reader */
  onViewFullscreen?: () => void
  onBranch?: (options?: { newPanel?: boolean }) => void
  /**
   * 'answer': quiet icon row under the answer, revealed on hover/focus of the answer.
   * 'plan': bottom bar of the plan card, always visible (it holds the Accept action).
   */
  variant: 'answer' | 'plan'
  /** Right-aligned content (Accept plan) */
  trailing?: React.ReactNode
}

/**
 * Response footer (spec §7.4 "Turn footer"): Copy · Markdown · Fullscreen · Branch as named
 * 24px icon buttons with tooltips — the same actions as the former text buttons.
 */
export function ResponseFooter({
  copied,
  onCopy,
  onPopOut,
  onViewFullscreen,
  onBranch,
  variant,
  trailing,
}: ResponseFooterProps) {
  const { t } = useTranslation()
  const copyLabel = copied ? t('common.copied') : t('common.copy')

  return (
    <div
      data-touch-reveal={variant === 'answer' ? 'true' : undefined}
      className={cn(
        'flex min-w-0 items-center gap-0.5',
        variant === 'answer'
          ? cn(HOVER_REVEAL, '-ml-1 group-hover/answer:opacity-100 group-hover/answer:duration-instant group-focus-within/answer:opacity-100')
          : 'border-t border-subtle px-2 py-1.5'
      )}
    >
      <TurnIconButton
        aria-label={copyLabel}
        tooltip
        icon={copied ? <Check className="size-3.5 text-success" /> : <Copy />}
        onClick={onCopy}
        className="turn-action-btn select-none"
      />
      {onPopOut && (
        <TurnIconButton
          aria-label={t('turnCard.viewAsMarkdown')}
          tooltip
          icon={<FileText />}
          onClick={onPopOut}
          className="turn-action-btn select-none"
        />
      )}
      {onViewFullscreen && (
        <TurnIconButton
          aria-label={t('common.viewFullscreen')}
          tooltip
          icon={<Maximize2 />}
          onClick={onViewFullscreen}
          className="turn-action-btn select-none"
        />
      )}
      {onBranch && <BranchDropdown onBranch={onBranch} />}
      {trailing && <div className="ml-auto flex shrink-0 items-center">{trailing}</div>}
    </div>
  )
}
