/**
 * Detail-pane empty states: what the pane beside a list shows while nothing is selected.
 * The sessions variant carries the display heading and the New session shortcut (spec §7.8).
 */

import { Trans, useTranslation } from 'react-i18next'
import { useActionLabel } from '@/actions'
import { HotkeyKeycaps } from '@/components/ui/hotkey-keycaps'

/** One quiet line, centred in the pane. */
export function DetailEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <p className="text-label text-tertiary">{message}</p>
    </div>
  )
}

/**
 * Sessions: no session selected. With sessions it invites picking one up; in a workspace without
 * any it asks the new-chat question instead.
 */
export function SessionsEmptyState({ hasSessions }: { hasSessions: boolean }) {
  const { t } = useTranslation()
  const newChatHotkey = useActionLabel('app.newChat').hotkey

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <h2 className="font-serif text-display text-foreground text-balance">
        {hasSessions ? t('session.emptyTitle') : t('session.emptyTitleFirst')}
      </h2>
      {newChatHotkey && (
        <p className="text-copy text-secondary">
          <Trans
            i18nKey={hasSessions ? 'session.emptyHint' : 'session.emptyHintFirst'}
            components={{ keys: <HotkeyKeycaps hotkey={newChatHotkey} className="mx-0.5 inline-flex align-[1px]" /> }}
          />
        </p>
      )}
    </div>
  )
}
