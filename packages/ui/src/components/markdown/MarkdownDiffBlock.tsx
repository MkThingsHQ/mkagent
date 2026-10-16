/**
 * MarkdownDiffBlock - Renders diff code blocks using @pierre/diffs
 *
 * When the markdown viewer encounters a ```diff code block, this component
 * renders it with the same pierre/diffs setup (PatchDiff) and styling used
 * in the full-screen diff overlay (ShikiDiffViewer), instead of plain
 * Shiki syntax highlighting.
 *
 * Handles common diff code block formats:
 * 1. Proper unified diffs (with --- / +++ / @@ headers) — passed directly
 * 2. Numbered hunks without file headers — synthetic file headers are prepended
 * 3. Bare diff content or bare @@ markers — synthetic headers are prepended
 *
 * Falls back to the regular CodeBlock if PatchDiff rendering fails.
 */

import * as React from 'react'
import { PatchDiff, type PatchDiffProps } from '@pierre/diffs/react'
import { DIFFS_TAG_NAME } from '@pierre/diffs'
import { FileDiff } from 'lucide-react'
import { cn } from '../../lib/utils'
import { CodeBlock } from './CodeBlock'
import { ensureUnifiedDiffFormat } from './diff-normalize'
import { countDiffRows, summarizePatch } from './diff-summary'
import { registerMkAgentShikiThemes } from '../code-viewer/registerShikiThemes'

// ── Custom element + theme registration (same as ShikiDiffViewer) ──────────
// Idempotent: safe to run even if ShikiDiffViewer already registered these.

if (typeof HTMLElement !== 'undefined' && !customElements.get(DIFFS_TAG_NAME)) {
  class FileDiffContainer extends HTMLElement {
    constructor() {
      super()
      if (this.shadowRoot != null) return
      this.attachShadow({ mode: 'open' })
    }
  }
  customElements.define(DIFFS_TAG_NAME, FileDiffContainer)
}

// Register custom themes once per runtime.
registerMkAgentShikiThemes()

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Detect whether we're in dark mode by checking the DOM class list.
 * Mirrors the fallback logic in CodeBlock.
 */
function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

// ── Error boundary ────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Lightweight error boundary so a PatchDiff failure doesn't crash the whole
 * message — we fall back to the regular CodeBlock instead.
 */
class DiffErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.warn('[MarkdownDiffBlock] PatchDiff render failed, falling back to CodeBlock:', error)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

// ── Theme bridge ──────────────────────────────────────────────────────────
// @pierre/diffs renders in a shadow root but reads these override variables, which inherit
// through it. Rows tint from the solved diff roles on the code area only (the line-number
// gutter stays neutral), word highlights use the stronger diff-word roles, the +/− sign
// column takes the success/destructive text roles, numbers stay tertiary (spec §7.4).
const DIFF_THEME_VARS = {
  '--diffs-font-family': 'var(--font-mono)',
  '--diffs-header-font-family': 'var(--font-sans)',
  '--diffs-font-size': 'var(--fs-mono)',
  '--diffs-line-height': '20px',
  '--diffs-addition-color-override': 'var(--success-text)',
  '--diffs-deletion-color-override': 'var(--destructive-text)',
  '--diffs-bg-addition-override': 'var(--diff-add)',
  '--diffs-bg-deletion-override': 'var(--diff-del)',
  '--diffs-bg-addition-hover-override': 'var(--diff-add)',
  '--diffs-bg-deletion-hover-override': 'var(--diff-del)',
  '--diffs-bg-addition-number-override': 'transparent',
  '--diffs-bg-deletion-number-override': 'transparent',
  '--diffs-bg-addition-emphasis-override': 'var(--diff-add-word)',
  '--diffs-bg-deletion-emphasis-override': 'var(--diff-del-word)',
  '--diffs-bg-hover-override': 'var(--fill-hover)',
  '--diffs-bg-separator-override': 'var(--fill-hover)',
  '--diffs-fg-number-override': 'var(--text-tertiary)',
  '--diffs-fg-number-addition-override': 'var(--text-tertiary)',
  '--diffs-fg-number-deletion-override': 'var(--text-tertiary)',
} as React.CSSProperties

/** PatchDiff line height (--diffs-line-height) and the vertical padding around its rows. */
const DIFF_ROW_PX = 20
const DIFF_PADDING_PX = 18

// ── Main component ────────────────────────────────────────────────────────

export interface MarkdownDiffBlockProps {
  /** Raw diff text from the markdown code block */
  code: string
  className?: string
}

export function MarkdownDiffBlock({ code, className }: MarkdownDiffBlockProps) {
  const dark = isDarkMode()
  const themeName = dark ? 'mkagent-dark' : 'mkagent-light'

  // Same renderer options as ShikiDiffViewer, with classic +/− indicators (sign column)
  const options: PatchDiffProps<undefined>['options'] = React.useMemo(() => ({
    theme: themeName,
    diffStyle: 'unified' as const,
    diffIndicators: 'classic' as const,
    disableBackground: false,
    lineDiffType: 'word' as const,
    overflow: 'scroll' as const,
    disableFileHeader: true,
    themeType: dark ? ('dark' as const) : ('light' as const),
  }), [themeName, dark])

  const patch = React.useMemo(() => ensureUnifiedDiffFormat(code), [code])
  const summary = React.useMemo(() => summarizePatch(code), [code])
  // PatchDiff paints asynchronously; reserve its height up front so the transcript doesn't
  // shift when the rows appear (answers are no longer capped in a 540px scroller).
  const reservedHeight = React.useMemo(() => countDiffRows(patch) * DIFF_ROW_PX + DIFF_PADDING_PX, [patch])

  const fallback = <CodeBlock code={code} language="diff" mode="full" className={className} />

  return (
    <DiffErrorBoundary fallback={fallback}>
      <div
        className={cn('relative overflow-hidden rounded-md border border-subtle bg-sunken', className)}
        style={DIFF_THEME_VARS}
      >
        {/* 32px header: path truncates at the start so the file name survives; stats never wrap */}
        <div className="flex h-8 items-center gap-2 border-b border-subtle px-3 text-label-sm text-tertiary">
          <FileDiff aria-hidden className="size-3.5 shrink-0" />
          <span title={summary.path ?? undefined} className="min-w-0 truncate text-left font-mono text-secondary [direction:rtl]">
            <bdi>{summary.path ?? 'diff'}</bdi>
          </span>
          {(summary.additions > 0 || summary.deletions > 0) && (
            <span className="shrink-0 whitespace-nowrap font-mono tabular-nums">
              {summary.additions > 0 && <span className="text-success">+{summary.additions}</span>}
              {summary.additions > 0 && summary.deletions > 0 && ' '}
              {summary.deletions > 0 && <span className="text-destructive">−{summary.deletions}</span>}
            </span>
          )}
        </div>
        <div className="py-1" style={{ minHeight: reservedHeight }}>
          <PatchDiff patch={patch} options={options} />
        </div>
      </div>
    </DiffErrorBoundary>
  )
}
