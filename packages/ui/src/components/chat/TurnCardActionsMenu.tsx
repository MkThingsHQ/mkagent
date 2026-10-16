import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal, FileDiff, ArrowUpRight } from 'lucide-react'
import { SimpleDropdown, SimpleDropdownItem } from '../ui/SimpleDropdown'
import { TurnIconButton } from './turn/TurnIconButton'

export interface TurnCardActionsMenuProps {
  /** Callback to open turn details in a new window */
  onOpenDetails?: () => void
  /** Callback to open all edits/writes in multi-file diff view */
  onOpenMultiFileDiff?: () => void
  /** Whether this turn has any Edit or Write activities */
  hasEditOrWriteActivities?: boolean
  /** Additional className for the trigger button */
  className?: string
}

/**
 * TurnCardActionsMenu - Dropdown menu for TurnCard header actions
 *
 * Shows:
 * - "View file changes" when turn has Edit/Write activities
 * - "View turn details" always
 *
 * The trigger is a named 24px icon button; the work log row reveals it on hover/focus.
 */
export function TurnCardActionsMenu({
  onOpenDetails,
  onOpenMultiFileDiff,
  hasEditOrWriteActivities,
  className,
}: TurnCardActionsMenuProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = React.useState(false)

  // Don't render if no actions available
  if (!onOpenDetails && !onOpenMultiFileDiff) {
    return null
  }

  return (
    <SimpleDropdown
      align="end"
      onOpenChange={setIsOpen}
      trigger={
        <TurnIconButton
          aria-label={t('turnCard.moreActions')}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          icon={<MoreHorizontal />}
          className={className}
        />
      }
    >
      {onOpenMultiFileDiff && hasEditOrWriteActivities && (
        <SimpleDropdownItem
          onClick={onOpenMultiFileDiff}
          icon={<FileDiff />}
        >
          {t('chat.viewFileChanges')}
        </SimpleDropdownItem>
      )}
      {onOpenDetails && (
        <SimpleDropdownItem
          onClick={onOpenDetails}
          icon={<ArrowUpRight />}
        >
          {t('chat.viewTurnDetails')}
        </SimpleDropdownItem>
      )}
    </SimpleDropdown>
  )
}
