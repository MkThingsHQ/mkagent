import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { actionHotkeyKeys, composerSendKeys } from './action-hotkey'

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <KbdGroup>
        {keys.map((key, i) => <Kbd key={`${key}-${i}`}>{key}</Kbd>)}
      </KbdGroup>
      {label}
    </span>
  )
}

/**
 * Shortcut hints under the composer (spec §7.5, mockup `.cx-hints`), desktop only: the keys that
 * already exist — send and new line (per the Send-message-key setting) and ⇧Tab to cycle the
 * permission mode. Its height is always reserved and it fades in only while focus is inside the
 * composer card (`peer/composer` on InputContainer), so nothing shifts.
 */
export function ComposerHintLine({ empty = false }: { /** Keep the reserved space but show nothing (decision prompts) */ empty?: boolean }) {
  const { t } = useTranslation()
  const [sendMessageKey, setSendMessageKey] = React.useState<'enter' | 'cmd-enter'>('enter')

  // Same setting FreeFormInput reads for its key handling, so the hint always matches it
  React.useEffect(() => {
    let cancelled = false
    window.electronAPI?.getSendMessageKey?.()
      .then((key) => { if (!cancelled) setSendMessageKey(key ?? 'enter') })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const sendKeys = composerSendKeys(sendMessageKey)
  const cycleKeys = actionHotkeyKeys('chat.cyclePermissionMode')

  return (
    <div
      aria-hidden="true"
      data-composer-hints
      // 10px below the card (mt-2.5 + centred 20px keycaps), not glued to it
      className="mt-2.5 flex h-6 items-center justify-center gap-3.5 overflow-hidden text-label-sm text-tertiary whitespace-nowrap select-none opacity-0 transition-opacity duration-fast ease-out peer-focus-within/composer:opacity-100"
    >
      {!empty && (
        <>
          <Hint keys={sendKeys.send} label={t('shortcuts.sendMessage')} />
          {/* Narrow panels keep only the hints that fit, instead of clipping both ends */}
          <span className="contents @max-[24rem]/panel:hidden">
            <Hint keys={sendKeys.newLine} label={t('shortcuts.newLine')} />
          </span>
          {cycleKeys.length > 0 && (
            <span className="contents @max-[32rem]/panel:hidden">
              <Hint keys={cycleKeys} label={t('mode.permissionMode')} />
            </span>
          )}
        </>
      )}
    </div>
  )
}
