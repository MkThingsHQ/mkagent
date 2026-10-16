import * as React from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { AlertTriangle, CircleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Transcript placeholder while messages lazy-load: the shape of a short exchange (bubble,
 * work log line, answer lines). Shown through useDelayedLoading — only after 200ms, then for
 * at least 400ms — so fast loads go straight to content.
 */
export function TranscriptSkeleton() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-5" role="status" aria-label={t('common.loading')}>
      <Skeleton className="ml-auto h-10 w-1/2 rounded-xl" />
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-40" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
      <Skeleton className="ml-auto h-10 w-2/5 rounded-xl" />
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-48" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    </div>
  )
}

interface TranscriptLoadErrorProps {
  error: string
  onRetry?: () => void
  isRetrying?: boolean
}

/** Message load failure (instead of an infinite spinner): inline error marker + Retry. */
export function TranscriptLoadError({ error, onRetry, isRetrying = false }: TranscriptLoadErrorProps) {
  const { t } = useTranslation()
  return (
    <div className="flex h-64 items-center justify-center px-4">
      <div className="flex max-w-sm min-w-0 gap-2.5 rounded-md border-l-2 border-destructive bg-destructive-tint px-3 py-2.5">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="text-label font-semibold text-destructive">{t("chat.failedToLoadConversation")}</div>
          <p className="mt-0.5 break-words text-label leading-5 text-foreground">{error}</p>
          {onRetry && (
            <Button
              variant="primary"
              size="sm"
              className="mt-2"
              onClick={onRetry}
              disabled={isRetrying}
            >
              {isRetrying ? t("common.retrying") : t("common.retry")}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Loaded transcript that produced no renderable turns (unsupported history format). */
export function NoRenderableMessages() {
  const { t } = useTranslation()
  return (
    <div className="flex h-64 items-center justify-center px-4">
      <div className="flex max-w-sm min-w-0 gap-2.5 rounded-md bg-fill-hover px-3 py-2.5">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-tertiary" />
        <div className="min-w-0 flex-1">
          <div className="text-label font-semibold text-foreground">{t("chat.noRenderableMessages")}</div>
          <p className="mt-0.5 text-label leading-5 text-secondary">{t("chat.noRenderableMessagesHint")}</p>
        </div>
      </div>
    </div>
  )
}

/** Empty state for compact mode (popover embedding): conversational prompt, centered. */
export function CompactEmptyState() {
  const { t } = useTranslation()
  return (
    <div className="pointer-events-none absolute inset-0 flex select-none flex-col items-center justify-center gap-1">
      <span className="text-label text-secondary">{t("editPopover.whatToChange")}</span>
      <span className="text-label-sm text-tertiary">{t("editPopover.justDescribe")}</span>
    </div>
  )
}

/**
 * A new, empty chat in the app (not EditPopover): the transcript's display moment (design spec §7.8,
 * serif only at display size). The composer stays where it is; `children` (the suggestion chips)
 * sit under the copy and take clicks, the rest of the overlay lets them through.
 */
export function NewChatEmptyState({ compact = false, children }: { compact?: boolean; children?: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="pointer-events-none absolute inset-0 flex select-none flex-col items-center justify-center gap-2 px-6 text-center">
      <h2 className={cn('font-serif text-foreground', compact ? 'text-title' : 'text-display')}>{t('chat.newChatTitle')}</h2>
      <p className="max-w-md text-label text-secondary">{t('chat.newChatSubtitle')}</p>
      {children && <div className="pointer-events-auto mt-4 flex justify-center">{children}</div>}
    </div>
  )
}

/** Hint above the first rendered turn when older turns are paged out. */
export function EarlierMessagesHint({ count }: { count: number }) {
  const { t } = useTranslation()
  return (
    <div className="select-none py-1 text-center text-label-sm text-tertiary">
      ↑ {t('chat.scrollUpForEarlier', { count })}
    </div>
  )
}
