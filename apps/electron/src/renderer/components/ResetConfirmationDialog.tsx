import { useState, useMemo } from "react"
import { useTranslation, Trans } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertTriangle } from "lucide-react"
import { useRegisterModal } from "@/context/ModalContext"

interface ResetConfirmationDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * ResetConfirmationDialog - Destructive action confirmation with math problem
 *
 * Shows a warning about data loss and requires the user to solve a random
 * math problem to confirm the reset action.
 */
export function ResetConfirmationDialog({
  open,
  onConfirm,
  onCancel,
}: ResetConfirmationDialogProps) {
  const { t } = useTranslation()
  const [answer, setAnswer] = useState("")

  // Register with modal context so X button / Cmd+W closes this dialog first
  useRegisterModal(open, onCancel)

  // Generate a random math problem when dialog opens
  const problem = useMemo(() => {
    const a = Math.floor(Math.random() * 50) + 10
    const b = Math.floor(Math.random() * 50) + 10
    return { a, b, sum: a + b }
  }, [open]) // Regenerate when dialog opens

  const isCorrect = parseInt(answer) === problem.sum

  const handleConfirm = () => {
    if (isCorrect) {
      setAnswer("")
      onConfirm()
    }
  }

  const handleCancel = () => {
    setAnswer("")
    onCancel()
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            {t("dialog.reset.title")}
          </DialogTitle>
          <DialogDescription className="text-left pt-2">
            <Trans i18nKey="dialog.reset.description" components={{ strong: <strong /> }} />
          </DialogDescription>
        </DialogHeader>

        <ul className="list-disc list-inside text-label text-secondary space-y-1 pl-2">
          <li>{t("dialog.reset.workspaces")}</li>
          <li>{t("dialog.reset.credentials")}</li>
          <li>{t("dialog.reset.preferences")}</li>
        </ul>

        <div className="bg-info-tint rounded-md p-3 text-label">
          <strong className="text-info">{t("dialog.reset.backupWarning")}</strong>
          <p className="text-secondary mt-1">
            {t("dialog.reset.cannotUndo")}
          </p>
        </div>

        <div className="space-y-2 pt-2">
          <label className="text-label font-medium">
            {t("dialog.reset.confirmSolve", { a: problem.a, b: problem.b })}
          </label>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={t("dialog.reset.enterAnswer")}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isCorrect) {
                handleConfirm()
              }
            }}
            className="max-w-32"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger-solid"
            disabled={!isCorrect}
            onClick={handleConfirm}
          >
            {t("dialog.reset.title")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
