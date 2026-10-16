import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Key, Monitor } from "lucide-react"
import { MkAgentAppIcon } from "@/components/icons/MkAgentAppIcon"
import { StepFormLayout } from "./primitives"
import claudeIcon from "@/assets/provider-icons/claude.svg"
import openaiIcon from "@/assets/provider-icons/openai.svg"

/**
 * The high-level provider choice the user makes on first launch.
 * This maps to one or more ApiSetupMethods downstream.
 */
export type ProviderChoice = 'claude' | 'chatgpt' | 'api_key' | 'local'

interface ProviderOption {
  id: ProviderChoice
  name: string
  description: string
  icon: React.ReactNode
}

// Marks follow the text color (OpenAI and Copilot are monochrome); Claude keeps its brand color.
const PROVIDER_ICONS: Record<ProviderChoice, React.ReactNode> = {
  claude: <img src={claudeIcon} alt="" className="size-5 rounded-[3px]" />,
  chatgpt: <img src={openaiIcon} alt="" className="size-5 rounded-[3px]" />,
  api_key: <Key className="size-5" />,
  local: <Monitor className="size-5" />,
}

interface ProviderSelectStepProps {
  /** Called when the user selects a provider */
  onSelect: (choice: ProviderChoice) => void
  /** Called when the user chooses to skip setup */
  onSkip?: () => void
}

/**
 * ProviderSelectStep — First screen after install.
 *
 * Welcomes the user and asks them to pick their subscription / auth method.
 * Selecting a card immediately advances to the next step.
 */
export function ProviderSelectStep({ onSelect, onSkip }: ProviderSelectStepProps) {
  const { t } = useTranslation()

  const PROVIDER_OPTIONS: ProviderOption[] = [
    {
      id: 'claude',
      name: t("onboarding.providerSelect.claudeProMax"),
      description: t("onboarding.providerSelect.claudeProMaxDesc"),
      icon: PROVIDER_ICONS.claude,
    },
    {
      id: 'chatgpt',
      name: t("onboarding.providerSelect.codexChatGPT"),
      description: t("onboarding.providerSelect.codexChatGPTDesc"),
      icon: PROVIDER_ICONS.chatgpt,
    },
    {
      id: 'api_key',
      name: t("onboarding.providerSelect.otherProvider"),
      description: t("onboarding.providerSelect.otherProviderDesc"),
      icon: PROVIDER_ICONS.api_key,
    },
    {
      id: 'local',
      name: t("onboarding.providerSelect.localModel"),
      description: t("onboarding.providerSelect.localModelDesc"),
      icon: PROVIDER_ICONS.local,
    },
  ]

  return (
    <StepFormLayout
      iconElement={
        <div className="flex size-16 items-center justify-center">
          <MkAgentAppIcon className="size-10 text-accent" />
        </div>
      }
      title={t("onboarding.providerSelect.title")}
      description={t("onboarding.providerSelect.description")}
    >
      {/* Provider tiles (mockup .prov-opt): hairline ring, mark in the text color, name + one-line
          description. Choosing one still advances immediately. */}
      <div className="flex flex-col gap-1.5">
        {PROVIDER_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            className={cn(
              "motion-press flex w-full min-h-[52px] items-center gap-3 rounded-md px-3 py-2 text-left",
              "ring-1 ring-inset ring-border hover:bg-fill-hover active:bg-fill-pressed",
            )}
          >
            <span className="flex size-6 shrink-0 items-center justify-center text-foreground">
              {option.icon}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-label font-medium text-foreground">{option.name}</span>
              <span className="block text-label-sm text-secondary">
                {option.description}
              </span>
            </span>
          </button>
        ))}
      </div>

      {onSkip && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onSkip}
            className="min-h-6 text-label text-accent underline underline-offset-2 decoration-accent/40 hover:decoration-accent"
          >
            {t("onboarding.providerSelect.setupLater")}
          </button>
        </div>
      )}
    </StepFormLayout>
  )
}
