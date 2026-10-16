import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'

export interface ImageSupportWarningBannerProps {
  /** Display name of the active model — interpolated into the message. */
  modelName: string
  /** Click-handler for the inline "Enable image support" action. */
  onEnable: () => void
}

/**
 * Pre-flight banner shown above the chat input when the user has staged image
 * attachments while the active custom-endpoint model is configured as text-only.
 *
 * Rendering conditions live in the parent (`FreeFormInput`); this component just
 * draws the warning and the inline action. The action calls the same
 * `setModelSupportsImages` flow used by the model picker's per-row toggle, so the
 * two surfaces always agree on the connection's state.
 */
export function ImageSupportWarningBanner({
  modelName,
  onEnable,
}: ImageSupportWarningBannerProps) {
  const { t } = useTranslation()
  return (
    <div className="mx-1.5 mt-1.5 flex items-center gap-2 rounded-lg bg-info-tint px-3 py-2 text-label-sm text-secondary">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-info" />
      <span className="flex-1 min-w-0">
        {t('chat.imageWarning.title', { modelName })}
      </span>
      <button
        type="button"
        onClick={onEnable}
        className="min-h-control-sm shrink-0 font-medium text-foreground underline underline-offset-2"
      >
        {t('chat.imageWarning.action')}
      </button>
    </div>
  )
}
