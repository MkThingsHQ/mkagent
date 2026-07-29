/** API-key/local connection step for the Pi-only MkAgent runtime. */
import { useTranslation } from "react-i18next"
import type { ApiSetupMethod } from "./APISetupStep"
import { StepFormLayout, BackButton, ContinueButton } from "./primitives"
import { ApiKeyInput, type ApiKeyStatus, type ApiKeySubmitData } from "../apisetup"
import type { CustomEndpointApi } from '@config/llm-connections'

export type CredentialStatus = ApiKeyStatus

interface CredentialsStepProps {
  apiSetupMethod: ApiSetupMethod
  status: CredentialStatus
  errorMessage?: string
  onSubmit: (data: ApiKeySubmitData) => void
  onBack: () => void
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
  onBack,
  editInitialValues,
}: CredentialsStepProps) {
  const { t } = useTranslation()
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
