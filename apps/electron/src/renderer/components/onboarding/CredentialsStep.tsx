/** API-key/local connection step for the Pi-only MkAgent runtime. */
import { useTranslation } from "react-i18next"
import { ExternalLink } from "lucide-react"
import type { ApiSetupMethod } from "./APISetupStep"
import { StepFormLayout, BackButton, ContinueButton } from "./primitives"
import { ApiKeyInput, OAuthConnect, type ApiKeyStatus, type ApiKeySubmitData, type OAuthStatus } from "../apisetup"
import type { CustomEndpointApi } from '@config/llm-connections'

export type CredentialStatus = ApiKeyStatus | OAuthStatus

interface CredentialsStepProps {
  apiSetupMethod: ApiSetupMethod
  status: CredentialStatus
  errorMessage?: string
  onSubmit: (data: ApiKeySubmitData) => void
  onStartOAuth?: (methodOverride?: ApiSetupMethod) => void
  onBack: () => void
  isWaitingForCode?: boolean
  onSubmitAuthCode?: (code: string) => void
  onCancelOAuth?: () => void
  editInitialValues?: {
    apiKey?: string
    baseUrl?: string
    connectionDefaultModel?: string
    activePreset?: string
    models?: string[]
    customApi?: CustomEndpointApi
  }
}

export function CredentialsStep({
  apiSetupMethod,
  status,
  errorMessage,
  onSubmit,
  onStartOAuth,
  onBack,
  isWaitingForCode,
  onSubmitAuthCode,
  onCancelOAuth,
  editInitialValues,
}: CredentialsStepProps) {
  const { t } = useTranslation()
  const isClaudeOAuth = apiSetupMethod === 'claude_oauth'
  const isChatGptOAuth = apiSetupMethod === 'pi_chatgpt_oauth'

  if (isChatGptOAuth) {
    return (
      <StepFormLayout
        title={t("onboarding.credentials.connectChatGPT")}
        description={t("onboarding.credentials.connectChatGPTDesc")}
        actions={(
          <>
            <BackButton onClick={onBack} disabled={status === 'validating'} />
            <ContinueButton onClick={() => onStartOAuth?.()} loading={status === 'validating'} loadingText={t("common.connecting")} className="gap-2">
              <ExternalLink className="size-4" />
              {t("onboarding.credentials.signInChatGPT")}
            </ContinueButton>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-foreground-2 p-4 text-sm text-muted-foreground">
            <p>{t("onboarding.credentials.chatGPTInstructions")}</p>
          </div>
          {status === 'error' && errorMessage && <div className="rounded-lg bg-destructive/10 text-destructive text-sm p-3">{errorMessage}</div>}
        </div>
      </StepFormLayout>
    )
  }

  if (isClaudeOAuth) {
    if (isWaitingForCode) {
      return (
        <StepFormLayout
          title={t("onboarding.credentials.enterAuthCode")}
          description={t("onboarding.credentials.copyCodeInstruction")}
          actions={(
            <>
              <BackButton onClick={onCancelOAuth} disabled={status === 'validating'}>{t("common.cancel")}</BackButton>
              <ContinueButton type="submit" form="auth-code-form" loading={status === 'validating'} loadingText={t("common.connecting")} />
            </>
          )}
        >
          <OAuthConnect status={status as OAuthStatus} errorMessage={errorMessage} isWaitingForCode onStartOAuth={onStartOAuth!} onSubmitAuthCode={onSubmitAuthCode} onCancelOAuth={onCancelOAuth} />
        </StepFormLayout>
      )
    }
    return (
      <StepFormLayout
        title={t("onboarding.credentials.connectClaude")}
        description={t("onboarding.credentials.claudeSubscriptionDesc")}
        actions={(
          <>
            <BackButton onClick={onBack} disabled={status === 'validating'} />
            <ContinueButton onClick={() => onStartOAuth?.()} loading={status === 'validating'} loadingText={t("common.connecting")} className="gap-2">
              <ExternalLink className="size-4" />
              {t("onboarding.credentials.signInClaude")}
            </ContinueButton>
          </>
        )}
      >
        <OAuthConnect status={status as OAuthStatus} errorMessage={errorMessage} isWaitingForCode={false} onStartOAuth={onStartOAuth!} onSubmitAuthCode={onSubmitAuthCode} onCancelOAuth={onCancelOAuth} />
      </StepFormLayout>
    )
  }
  const apiKeyInputKey = [
    apiSetupMethod,
    editInitialValues?.activePreset ?? '',
    editInitialValues?.baseUrl ?? '',
    editInitialValues?.connectionDefaultModel ?? '',
    (editInitialValues?.models ?? []).join('|'),
    editInitialValues?.customApi ?? '',
  ].join('::')

  return (
    <StepFormLayout
      title={t("onboarding.credentials.apiConfiguration")}
      description="Select a provider preset and enter its API key, or configure an Ollama/custom compatible endpoint."
      actions={(
        <>
          <BackButton onClick={onBack} disabled={status === 'validating'} />
          <ContinueButton
            type="submit"
            form="api-key-form"
            loading={status === 'validating'}
            loadingText={t("common.validating")}
          />
        </>
      )}
    >
      <ApiKeyInput
        key={apiKeyInputKey}
        status={status}
        errorMessage={errorMessage}
        onSubmit={onSubmit}
        initialValues={editInitialValues}
      />
    </StepFormLayout>
  )
}
