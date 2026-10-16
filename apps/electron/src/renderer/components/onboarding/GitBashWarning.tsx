import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Download, FolderOpen, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StepFormLayout, BackButton } from "./primitives"
import type { GitBashStatus } from "../../../shared/types"

export type { GitBashStatus }

interface GitBashWarningProps {
  status: GitBashStatus
  onBrowse: () => Promise<string | null>
  onUsePath: (path: string) => void
  onRecheck: () => void
  onBack: () => void
  isRechecking?: boolean
  errorMessage?: string
  onClearError?: () => void
}

/**
 * GitBashWarning - Warning screen when Git Bash is not found on Windows
 *
 * Shows:
 * - Warning message explaining why Git Bash is needed
 * - Download link to Git for Windows
 * - Option to manually specify bash.exe path
 * - Option to skip and continue anyway
 */
export function GitBashWarning({
  status,
  onBrowse,
  onUsePath,
  onRecheck,
  onBack,
  isRechecking = false,
  errorMessage,
  onClearError,
}: GitBashWarningProps) {
  const { t } = useTranslation()
  const [customPath, setCustomPath] = useState(status.path || '')
  const [showCustomPath, setShowCustomPath] = useState(false)

  const handleBrowse = async () => {
    const path = await onBrowse()
    if (path) {
      setCustomPath(path)
      setShowCustomPath(true)
    }
  }

  const handleUsePath = () => {
    if (customPath.trim()) {
      onUsePath(customPath.trim())
    }
  }

  const handleDownload = () => {
    window.electronAPI.openUrl('https://git-scm.com/downloads/win')
  }

  return (
    <StepFormLayout
      title={t("onboarding.gitBash.title")}
      description={t("onboarding.gitBash.description")}
    >
      <div className="space-y-4">
        {/* Primary action: Download Git */}
        <div className="rounded-lg bg-sunken p-4 ring-1 ring-inset ring-separator">
          <h3 className="text-label font-medium text-foreground">
            {t("onboarding.gitBash.installTitle")}
          </h3>
          <p className="mt-1 text-label-sm text-tertiary">
            {t("onboarding.gitBash.installDesc")}
          </p>
          <Button
            onClick={handleDownload}
            className="mt-3 w-full"
            size="sm"
          >
            <Download className="mr-2 size-4" />
            {t("onboarding.gitBash.download")}
          </Button>
        </div>

        {/* Secondary: Already have Git? */}
        <div className="rounded-lg bg-sunken p-4 ring-1 ring-inset ring-separator">
          <h3 className="text-label font-medium text-foreground">
            {t("onboarding.gitBash.alreadyInstalled")}
          </h3>
          <p className="mt-1 text-label-sm text-tertiary">
            {t("onboarding.gitBash.customPath")}
          </p>

          {showCustomPath ? (
            <div className="mt-3 space-y-2">
              <Input
                value={customPath}
                onChange={(e) => {
                  setCustomPath(e.target.value)
                  onClearError?.()
                }}
                placeholder={t("onboarding.gitBash.pathPlaceholder")}
                className="text-label-sm"
              />
              <Button
                onClick={handleUsePath}
                disabled={!customPath.trim()}
                className="w-full "
                size="sm"
              >
                {t("onboarding.gitBash.useThisPath")}
              </Button>
              {errorMessage && (
                <p className="text-label-sm text-red-500">{errorMessage}</p>
              )}
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button
                onClick={onRecheck}
                disabled={isRechecking}
                size="sm"
                className="flex-1 bg-background text-foreground hover:bg-fill-hover rounded-lg shadow-minimal"
              >
                <RefreshCw className={`mr-2 size-4 ${isRechecking ? 'animate-spin' : ''}`} />
                {isRechecking ? t("common.checking") : t("onboarding.gitBash.recheck")}
              </Button>
              <Button
                onClick={handleBrowse}
                size="sm"
                className="flex-1 bg-background text-foreground hover:bg-fill-hover rounded-lg shadow-minimal"
              >
                <FolderOpen className="mr-2 size-4" />
                {t("onboarding.gitBash.browse")}
              </Button>
            </div>
          )}
        </div>

        {/* Back button */}
        <div className="flex justify-center pt-2">
          <BackButton onClick={onBack} className="max-w-[200px]" />
        </div>
      </div>
    </StepFormLayout>
  )
}
