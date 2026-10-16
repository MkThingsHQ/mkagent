import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  DECISION_ACTION,
  DecisionActions,
  DecisionBody,
  DecisionCard,
  DecisionDetails,
  DecisionHeader,
  DecisionPreview,
  DecisionSpacer,
} from './DecisionCard'

export interface AdminApprovalRequestData {
  appName: string
  reason: string
  command: string
  impact?: string
  requiresSystemPrompt?: boolean
  rememberForMinutes?: number
}

interface AdminApprovalRequestProps {
  request: AdminApprovalRequestData
  onApprove: (options: { rememberForMinutes?: number }) => void
  onCancel: () => void
  /** When true, the composer slot (InputContainer) draws the card material and ring */
  unstyled?: boolean
}

/**
 * AdminApprovalRequest - Friendly admin-elevation approval card for non-technical users.
 *
 * Goal: make privileged escalation understandable and safe. Decision-card anatomy (spec §7.6):
 * Approve (primary) · Cancel (ghost) · "Remember" switch.
 */
export function AdminApprovalRequest({
  request,
  onApprove,
  onCancel,
  unstyled = false,
}: AdminApprovalRequestProps) {
  const { t } = useTranslation()
  const [rememberChoice, setRememberChoice] = React.useState(false)

  const rememberForMinutes = request.rememberForMinutes ?? 10

  const handleApprove = () => {
    onApprove({ rememberForMinutes: rememberChoice ? rememberForMinutes : undefined })
  }

  return (
    <DecisionCard tone="info" standalone={!unstyled}>
      <DecisionBody>
        <DecisionHeader tone="info" icon={<ShieldAlert />} title={t('chat.adminApprovalRequired')} />
        <DecisionDetails>
          <p className="text-label text-secondary">
            {t('adminApproval.installing')} <span className="font-medium text-foreground">{request.appName}</span> {t('adminApproval.needsMacApproval')}
            {request.requiresSystemPrompt ? ` ${t('adminApproval.systemPromptHint')}` : ''}
            <br />
            <span className="font-medium text-foreground">{t('adminApproval.why')}:</span> {request.reason}
            {request.impact && (
              <>
                <br />
                <span className="font-medium text-foreground">{t('adminApproval.impact')}:</span> {request.impact}
              </>
            )}
          </p>

          <DecisionPreview>{request.command}</DecisionPreview>
        </DecisionDetails>
      </DecisionBody>

      <DecisionActions>
        <Button
          variant="primary"
          size="lg"
          className={`${DECISION_ACTION} cursor-pointer`}
          onClick={handleApprove}
        >
          {t('adminApproval.approve')}
        </Button>

        <Button
          variant="ghost"
          size="lg"
          className={DECISION_ACTION}
          onClick={onCancel}
        >
          {t('common.cancel')}
        </Button>

        <DecisionSpacer />

        <div className="flex items-center gap-2">
          <Switch
            checked={rememberChoice}
            onCheckedChange={setRememberChoice}
            aria-label={t('adminApproval.rememberExactCommand', { count: rememberForMinutes })}
          />
          <Label className="cursor-pointer text-label-sm text-secondary" onClick={() => setRememberChoice(!rememberChoice)}>
            {t('adminApproval.rememberMinutes', { count: rememberForMinutes })}
          </Label>
        </div>
      </DecisionActions>
    </DecisionCard>
  )
}
