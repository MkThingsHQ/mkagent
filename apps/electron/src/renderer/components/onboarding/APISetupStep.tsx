import { useTranslation } from "react-i18next"
import { Check, Key } from "lucide-react"
import { cn } from "@/lib/utils"
import { StepFormLayout, BackButton, ContinueButton } from "./primitives"
import type { LlmAuthType, LlmProviderType } from "@mkagent/shared/config/llm-connections"

export type ApiSetupMethod = 'claude_oauth' | 'pi_chatgpt_oauth' | 'pi_api_key'

export function apiSetupMethodToConnectionTypes(method: ApiSetupMethod): {
  providerType: LlmProviderType
  authType: LlmAuthType
} {
  return { providerType: 'pi', authType: method === 'pi_api_key' ? 'api_key' : 'oauth' }
}

interface APISetupStepProps {
  selectedMethod: ApiSetupMethod | null
  onSelect: (method: ApiSetupMethod) => void
  onContinue: () => void
  onBack: () => void
}

export function APISetupStep({ selectedMethod, onSelect, onContinue, onBack }: APISetupStepProps) {
  const { t } = useTranslation()
  const option = {
    id: 'pi_api_key' as const,
    name: t("onboarding.apiSetup.apiKey"),
    description: t("onboarding.apiSetup.apiKeyDesc"),
  }

  return (
    <StepFormLayout
      title={t("onboarding.apiSetup.title")}
      description={t("onboarding.apiSetup.description")}
      actions={(
        <>
          <BackButton onClick={onBack} />
          <ContinueButton onClick={onContinue} disabled={!selectedMethod} />
        </>
      )}
    >
      <button
        onClick={() => onSelect(option.id)}
        className={cn(
          "flex w-full items-start gap-4 rounded-xl p-4 text-left transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "hover:bg-foreground/[0.02] shadow-minimal",
          selectedMethod === option.id ? "bg-background" : "bg-foreground-2",
        )}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Key className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{option.name}</div>
          <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
        </div>
        <div className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          selectedMethod === option.id
            ? "border-foreground bg-foreground text-background"
            : "border-muted-foreground/20",
        )}>
          {selectedMethod === option.id && <Check className="size-3" strokeWidth={3} />}
        </div>
      </button>
    </StepFormLayout>
  )
}
