import { useTranslation } from 'react-i18next'
import { Hand, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PermissionRequest as PermissionRequestType } from '../../../../../shared/types'
import type { PermissionResponse } from './types'
import {
  DECISION_ACTION,
  DecisionActions,
  DecisionBody,
  DecisionCard,
  DecisionDetails,
  DecisionFoot,
  DecisionHeader,
  DecisionPreview,
  DecisionSpacer,
  type DecisionTone,
} from './DecisionCard'

interface PermissionRequestProps {
  request: PermissionRequestType
  onResponse: (response: PermissionResponse) => void
  /** When true, the composer slot (InputContainer) draws the card material and ring */
  unstyled?: boolean
}

/**
 * PermissionRequest - Self-contained structured input for permission approval
 *
 * Decision-card anatomy (spec §7.6): hand icon tile + "Permission required", the tool and its
 * description, decision-model risk chips (destructive ring + tile when present), the command in
 * a sunken well (scrollable), then Allow (primary) · Always Allow (secondary, only when there is
 * something to remember) · Deny (ghost).
 */
export function PermissionRequest({ request, onResponse, unstyled = false }: PermissionRequestProps) {
  const { t } = useTranslation()
  const canRemember = !!request.canAlwaysAllow
  const tone: DecisionTone = 'info'

  const handleAllow = () => {
    onResponse({ type: 'permission', allowed: true, alwaysAllow: false })
  }

  const handleAlwaysAllow = () => {
    onResponse({ type: 'permission', allowed: true, alwaysAllow: true })
  }

  const handleDeny = () => {
    onResponse({ type: 'permission', allowed: false, alwaysAllow: false })
  }

  return (
    <DecisionCard tone={tone} standalone={!unstyled} data-tutorial="permission-banner">
      {/* Content - grows to fill available space and scrolls before actions disappear */}
      <DecisionBody>
        <DecisionHeader
          tone={tone}
          icon={<Hand />}
          title={t('chat.permissionRequired')}
        />
        <DecisionDetails>
          <p className="text-label text-secondary">
            <span className="font-medium text-foreground">{t('permission.tool')}</span>{' '}
            <span className="font-mono text-mono-ui text-foreground">{request.toolName}</span>
            <br />
            {request.description}
          </p>

        </DecisionDetails>
      </DecisionBody>

      {/* Action buttons */}
      <DecisionActions>
        <Button
          variant="primary"
          size="lg"
          className={DECISION_ACTION}
          onClick={handleAllow}
          data-tutorial="permission-allow-button"
        >
          {t('permission.allow')}
        </Button>
        {canRemember && (
          <Button
            variant="secondary"
            size="lg"
            className={DECISION_ACTION}
            onClick={handleAlwaysAllow}
          >
            {t('permission.alwaysAllow')}
          </Button>
        )}
        <DecisionSpacer />
        <Button
          variant="ghost"
          size="lg"
          className={DECISION_ACTION}
          onClick={handleDeny}
        >
          {t('permission.deny')}
        </Button>
      </DecisionActions>

      {/* What "Always Allow" does */}
      {canRemember && (
        <DecisionFoot icon={<RefreshCw />}>{t('permission.alwaysAllowHint')}</DecisionFoot>
      )}
    </DecisionCard>
  )
}
