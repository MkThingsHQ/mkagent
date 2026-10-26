/**
 * The card behind the Coding-mode PR chip: the PR's head (number, title, state, branches, size),
 * then Last commit (with local commits not pushed yet), Checks, Review and Merge, and a footer with
 * freshness, the credential that answered, one action (Resolve merge conflicts, else Fix review
 * comments, else Fix CI, else a green tick; see `prCardAction`), Refresh and Open on GitHub.
 *
 * The summary renders at once; detail sections show skeletons until `details` arrives.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUpFromLine,
  CircleCheck,
  CircleDashed,
  CircleX,
  ExternalLink,
  FilePen,
  FlaskConical,
  GitMerge,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { Spinner } from '@mkagent/ui'
import { CardButton } from '@/components/ui/card-button'
import { cn } from '@/lib/utils'
import { formatShortAge } from '@/utils/session'
import {
  checkRowsForCard,
  countChecks,
  mergeTone,
  prStateTone,
  reviewTone,
  shortSha,
  type MergeState,
  type PrCardAction,
  type PrCheck,
  type PrDetails,
  type PrSummary,
  type ReviewDecision,
  type ReviewerState,
} from './pr-watch-state'
import { CheckStatusGlyph, PR_STATE_ICON, TONE_TEXT } from './pr-watch-visuals'

/** The footer's "Updated 12s ago" stays roughly current while the card is open. */
const AGE_TICK_MS = 10_000

const REVIEW_KEY: Record<ReviewDecision, string> = {
  approved: 'chat.prWatch.review.approved',
  changes_requested: 'chat.prWatch.review.changesRequested',
  review_required: 'chat.prWatch.review.required',
  none: 'chat.prWatch.review.none',
}

const REVIEWER_KEY: Record<ReviewerState, string> = {
  approved: 'chat.prWatch.review.approved',
  changes_requested: 'chat.prWatch.review.changesRequested',
  commented: 'chat.prWatch.reviewer.commented',
  pending: 'chat.prWatch.reviewer.pending',
}

const MERGE_ICON: Record<MergeState, LucideIcon> = {
  clean: CircleCheck,
  behind: ArrowDown,
  blocked: ShieldAlert,
  conflicting: CircleX,
  unstable: AlertTriangle,
  draft: CircleDashed,
  unknown: CircleDashed,
}

export interface PrDetailsCardProps {
  summary: PrSummary
  details?: PrDetails
  refreshing?: boolean
  onRefresh?: () => void
  onOpenUrl: (url: string) => void
  /** The footer's action slot (`prCardAction`); every action but the ticks calls `onAction` */
  action?: PrCardAction | null
  /** Sends the action's prompt to the session */
  onAction?: () => void
}

export function PrDetailsCard({ summary, details, refreshing, onRefresh, onOpenUrl, action, onAction }: PrDetailsCardProps) {
  const { t } = useTranslation()
  const [, tick] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(() => {
    const id = setInterval(tick, AGE_TICK_MS)
    return () => clearInterval(id)
  }, [])

  const StateIcon = PR_STATE_ICON[summary.state]
  const stateTone = TONE_TEXT[prStateTone(summary.state)]
  const updatedLine = t('chat.prWatch.updated', { age: formatShortAge(summary.fetchedAt), via: summary.via })

  return (
    <div className="flex max-h-[min(560px,70vh)] flex-col">
      <header className="flex gap-2.5 px-3.5 pt-3 pb-2.5">
        <StateIcon className={cn('mt-0.5 size-4 shrink-0', stateTone)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-label font-medium text-foreground" title={summary.title}>
            <span className="tabular-nums text-tertiary">#{summary.number}</span> {summary.title}
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-label-sm text-tertiary">
            <span className={cn('shrink-0 font-medium', stateTone)}>{t(`chat.prWatch.state.${summary.state}`)}</span>
            <span aria-hidden>·</span>
            <span className="min-w-0 truncate font-mono text-mono-ui" title={`${summary.headRef} → ${summary.baseRef}`}>
              {summary.headRef} → {summary.baseRef}
            </span>
          </p>
          {details && (
            <p className="mt-0.5 text-label-sm text-tertiary tabular-nums">
              <span className="text-success">+{details.additions}</span>{' '}
              <span className="text-destructive">−{details.deletions}</span>
              {' · '}
              {t('chat.prWatch.files', { count: details.changedFiles })}
            </p>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <CardSection title={t('chat.prWatch.lastCommit')}>
          {details ? <LastCommit summary={summary} details={details} onOpenUrl={onOpenUrl} /> : <SkeletonLines />}
        </CardSection>
        <CardSection
          title={t('chat.prWatch.checks.title')}
          trailing={details && details.checks.length > 0 ? <CheckSummary checks={details.checks} /> : undefined}
        >
          {details ? <CheckList checks={details.checks} onOpenUrl={onOpenUrl} /> : <SkeletonLines />}
        </CardSection>
        <CardSection
          title={t('chat.prWatch.review.title')}
          trailing={summary.unresolvedThreads > 0 ? (
            <span className="inline-flex items-center gap-1 text-label-sm text-info tabular-nums">
              <MessageSquare className="size-3.5 shrink-0" aria-hidden />
              {t('chat.prWatch.openThreads', { count: summary.unresolvedThreads })}
            </span>
          ) : undefined}
        >
          <ReviewBody decision={summary.reviewDecision} details={details} />
        </CardSection>
        <CardSection title={t('chat.prWatch.merge.title')}>
          <MergeLine state={summary.mergeState} />
        </CardSection>
      </div>

      <footer className="flex items-center gap-0.5 border-t border-separator p-1.5">
        {/* Truncates when an action shows; the full line stays in the tooltip */}
        <span className="min-w-0 flex-1 truncate px-2 text-label-sm text-tertiary" title={updatedLine}>
          {updatedLine}
        </span>
        <CardAction action={action} onAction={onAction} />
        <CardButton
          icon={refreshing ? RefreshSpinner : RefreshCw}
          disabled={refreshing || !onRefresh}
          onClick={onRefresh}
          aria-label={t('chat.prWatch.refresh')}
          title={t('chat.prWatch.refresh')}
        />
        <CardButton icon={ExternalLink} onClick={() => onOpenUrl(summary.url)}>
          {t('chat.prWatch.openOnGitHub')}
        </CardButton>
      </footer>
    </div>
  )
}

const ACTION_BUTTON: Record<Exclude<PrCardAction, 'ok' | 'unsynced'>, { icon: LucideIcon; label: string; hint: string }> = {
  resolve: { icon: GitMerge, label: 'chat.prWatch.resolveConflicts', hint: 'chat.prWatch.resolveConflictsHint' },
  fix: { icon: Wrench, label: 'chat.prWatch.fixReview', hint: 'chat.prWatch.fixReviewHint' },
  'fix-ci': { icon: FlaskConical, label: 'chat.prWatch.fixChecks', hint: 'chat.prWatch.fixChecksHint' },
}

/**
 * Resolve (conflicts), else Fix (review comments), else Fix CI, else a tick: green when all good,
 * orange while local changes aren't in the PR (see prCardAction).
 */
function CardAction({ action, onAction }: { action?: PrCardAction | null; onAction?: () => void }) {
  const { t } = useTranslation()
  if (!action) return null
  if (action === 'ok' || action === 'unsynced') {
    const label = t(action === 'ok' ? 'chat.prWatch.allGood' : 'chat.prWatch.unsynced')
    return (
      <span role="img" aria-label={label} title={label} className={cn('inline-flex h-7 items-center px-2', action === 'ok' ? 'text-success' : 'text-info')}>
        <CircleCheck className="size-4" />
      </span>
    )
  }
  if (!onAction) return null
  const button = ACTION_BUTTON[action]
  return (
    <CardButton icon={button.icon} onClick={onAction} title={t(button.hint)}>
      {t(button.label)}
    </CardButton>
  )
}

/** CardButton takes an icon component; while refreshing that icon is the spinner. */
function RefreshSpinner({ className }: { className?: string }) {
  return <Spinner className={cn('text-label-sm', className)} />
}

function CardSection({ title, trailing, children }: { title: string; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-t border-separator px-3.5 py-2.5">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <h4 className="shrink-0 text-label-sm font-medium text-tertiary">{title}</h4>
        {trailing}
      </div>
      {children}
    </section>
  )
}

function SkeletonLines({ lines = 2 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-1.5" aria-busy>
      <div className="skeleton h-3.5 w-3/4" />
      {lines > 1 && <div className="skeleton h-3.5 w-1/2" />}
    </div>
  )
}

function LastCommit({ summary, details, onOpenUrl }: { summary: PrSummary; details: PrDetails; onOpenUrl: (url: string) => void }) {
  const { t } = useTranslation()
  const commit = details.lastCommit
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-baseline gap-2 text-label">
        <button
          type="button"
          onClick={() => onOpenUrl(`${summary.url}/commits/${commit.sha}`)}
          className="shrink-0 rounded-xs font-mono text-mono-ui text-accent hover:underline -outline-offset-1"
        >
          {shortSha(commit.sha)}
        </button>
        <span className="min-w-0 truncate text-foreground" title={commit.headline}>{commit.headline}</span>
      </div>
      <p className="text-label-sm text-tertiary">
        {commit.author} · {formatShortAge(commit.committedAt)}
      </p>
      {summary.localAhead > 0 && (
        <p className="flex items-center gap-1.5 text-label-sm text-info">
          <ArrowUpFromLine className="size-3.5 shrink-0" aria-hidden />
          {t('chat.prWatch.unpushed', { count: summary.localAhead })}
        </p>
      )}
      {summary.localDirty && (
        <p className="flex items-center gap-1.5 text-label-sm text-tertiary">
          <FilePen className="size-3.5 shrink-0" aria-hidden />
          {t('chat.prWatch.dirty')}
        </p>
      )}
    </div>
  )
}

function CheckSummary({ checks }: { checks: readonly PrCheck[] }) {
  const { t } = useTranslation()
  const counts = countChecks(checks)
  const parts: React.ReactNode[] = []
  if (counts.failed) parts.push(<span key="failed" className="text-destructive">{t('chat.prWatch.checks.failed', { count: counts.failed })}</span>)
  if (counts.running) parts.push(<span key="running" className="text-info">{t('chat.prWatch.checks.running', { count: counts.running })}</span>)
  if (counts.passed) parts.push(<span key="passed">{t('chat.prWatch.checks.passed', { count: counts.passed })}</span>)
  return (
    <span className="min-w-0 truncate text-label-sm text-tertiary tabular-nums">
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 && ' · '}
          {part}
        </React.Fragment>
      ))}
    </span>
  )
}

function CheckList({ checks, onOpenUrl }: { checks: readonly PrCheck[]; onOpenUrl: (url: string) => void }) {
  const { t } = useTranslation()
  if (checks.length === 0) {
    return <p className="text-label-sm text-tertiary">{t('chat.prWatch.checks.noneReported')}</p>
  }
  const { rows, overflow } = checkRowsForCard(checks)
  if (rows.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-label-sm text-success">
        <CircleCheck className="size-3.5 shrink-0" aria-hidden />
        {t('chat.prWatch.checks.allPassed')}
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((check) => (
        <li key={check.name} className="flex min-w-0 items-center gap-2 text-label-sm">
          <CheckStatusGlyph status={check.status} />
          <span className="min-w-0 flex-1 truncate text-secondary" title={check.name}>{check.name}</span>
          {check.url && (
            <button
              type="button"
              onClick={() => onOpenUrl(check.url!)}
              className="shrink-0 rounded-xs text-accent hover:underline -outline-offset-1"
            >
              {t('chat.prWatch.checks.details')}
            </button>
          )}
        </li>
      ))}
      {overflow > 0 && <li className="text-label-sm text-tertiary">{t('chat.prWatch.checks.more', { count: overflow })}</li>}
    </ul>
  )
}

function ReviewBody({ decision, details }: { decision: ReviewDecision; details?: PrDetails }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1.5">
      <p className={cn('text-label-sm font-medium', TONE_TEXT[reviewTone(decision)])}>{t(REVIEW_KEY[decision])}</p>
      {details ? (
        details.reviewers.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {details.reviewers.map((reviewer) => (
              <span
                key={reviewer.login}
                className="inline-flex items-center gap-1 text-label-sm text-secondary"
                title={t(REVIEWER_KEY[reviewer.state])}
              >
                <ReviewerGlyph state={reviewer.state} />
                @{reviewer.login}
              </span>
            ))}
          </div>
        )
      ) : (
        <SkeletonLines lines={1} />
      )}
    </div>
  )
}

function ReviewerGlyph({ state }: { state: ReviewerState }) {
  switch (state) {
    case 'approved': return <CircleCheck className="size-3.5 shrink-0 text-success" aria-hidden />
    case 'changes_requested': return <CircleX className="size-3.5 shrink-0 text-destructive" aria-hidden />
    case 'commented': return <MessageSquare className="size-3.5 shrink-0 text-tertiary" aria-hidden />
    case 'pending': return <CircleDashed className="size-3.5 shrink-0 text-tertiary" aria-hidden />
  }
}

function MergeLine({ state }: { state: MergeState }) {
  const { t } = useTranslation()
  const Icon = MERGE_ICON[state]
  return (
    <p className={cn('flex items-center gap-1.5 text-label-sm', TONE_TEXT[mergeTone(state)])}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {t(`chat.prWatch.merge.${state}`)}
    </p>
  )
}
