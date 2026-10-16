/**
 * InputSettingsPage
 *
 * Input behavior settings that control how the chat input works.
 *
 * Settings:
 * - Auto Capitalisation (on/off)
 * - Spell Check (on/off)
 * - Send Message Key (Enter or ⌘+Enter)
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { HeaderMenu } from '@/components/ui/HeaderMenu'
import { routes } from '@/lib/navigate'
import { isMac } from '@/lib/platform'
import type { DetailsPageMeta } from '@/lib/navigation-registry'

import {
  SettingsPage,
  SettingsSection,
  SettingsCard,
  SettingsToggle,
  SettingsMenuSelectRow,
} from '@/components/settings'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'input',
}

// ============================================
// Main Component
// ============================================

export default function InputSettingsPage() {
  const { t } = useTranslation()

  // Auto-capitalisation state
  const [autoCapitalisation, setAutoCapitalisation] = useState(true)

  // Spell check state (default off)
  const [spellCheck, setSpellCheck] = useState(false)

  // Send message key state
  const [sendMessageKey, setSendMessageKey] = useState<'enter' | 'cmd-enter'>('enter')

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      if (!window.electronAPI) return
      try {
        const [autoCapEnabled, spellCheckEnabled, sendKey] = await Promise.all([
          window.electronAPI.getAutoCapitalisation(),
          window.electronAPI.getSpellCheck(),
          window.electronAPI.getSendMessageKey(),
        ])
        setAutoCapitalisation(autoCapEnabled)
        setSpellCheck(spellCheckEnabled)
        setSendMessageKey(sendKey)
      } catch (error) {
        console.error('Failed to load input settings:', error)
      }
    }
    loadSettings()
  }, [])

  const handleAutoCapitalisationChange = useCallback(async (enabled: boolean) => {
    setAutoCapitalisation(enabled)
    await window.electronAPI.setAutoCapitalisation(enabled)
  }, [])

  const handleSpellCheckChange = useCallback(async (enabled: boolean) => {
    setSpellCheck(enabled)
    await window.electronAPI.setSpellCheck(enabled)
  }, [])

  const handleSendMessageKeyChange = useCallback((value: string) => {
    const key = value as 'enter' | 'cmd-enter'
    setSendMessageKey(key)
    window.electronAPI.setSendMessageKey(key)
  }, [])

  return (
    <SettingsPage
      title={t("settings.input.title")}
      description={t("settings.input.description")}
      actions={<HeaderMenu route={routes.view.settings('input')} />}
    >
      {/* Typing Behavior */}
      <SettingsSection title={t("settings.input.typing")} description={t("settings.input.typingDesc")}>
        <SettingsCard>
          <SettingsToggle
            label={t("settings.input.autoCapitalisation")}
            description={t("settings.input.autoCapitalisationDesc")}
            checked={autoCapitalisation}
            onCheckedChange={handleAutoCapitalisationChange}
          />
          <SettingsToggle
            label={t("settings.input.spellCheck")}
            description={t("settings.input.spellCheckDesc")}
            checked={spellCheck}
            onCheckedChange={handleSpellCheckChange}
          />
        </SettingsCard>
      </SettingsSection>

      {/* Send Behavior */}
      <SettingsSection title={t("settings.input.sending")} description={t("settings.input.sendingDesc")}>
        <SettingsCard>
          <SettingsMenuSelectRow
            label={t("settings.input.sendMessageWith")}
            description={t("settings.input.sendMessageWithDesc")}
            value={sendMessageKey}
            onValueChange={handleSendMessageKeyChange}
            options={[
              { value: 'enter', label: t("settings.input.enterKey"), description: t("settings.input.enterKeyDesc") },
              { value: 'cmd-enter', label: isMac ? t("settings.input.cmdEnterKey") : t("settings.input.ctrlEnterKey"), description: t("settings.input.cmdEnterKeyDesc") },
            ]}
          />
        </SettingsCard>
      </SettingsSection>
    </SettingsPage>
  )
}
