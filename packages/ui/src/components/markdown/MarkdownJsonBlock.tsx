/**
 * MarkdownJsonBlock - Interactive JSON tree viewer for markdown code blocks
 *
 * When the markdown viewer encounters a ```json code block, this component
 * renders it with the same @uiw/react-json-view setup and styling used in
 * JSONPreviewOverlay, instead of static Shiki syntax highlighting.
 *
 * - Parses the raw code string as JSON
 * - Recursively expands stringified-JSON-within-JSON (deepParseJson)
 * - Uses MkAgent themes (transparent background and CSS variable fonts)
 * - Defaults to collapsed={2} for inline chat context
 * - Falls back to CodeBlock if JSON parsing or rendering fails
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import JsonView from '@uiw/react-json-view'
import { vscodeTheme } from '@uiw/react-json-view/vscode'
import { githubLightTheme } from '@uiw/react-json-view/githubLight'
import { Copy, Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import { CodeBlock } from './CodeBlock'
import { TurnIconButton } from '../chat/turn/TurnIconButton'

// ── Themes (same as JSONPreviewOverlay) ────────────────────────────────────
// Transparent background so the container's sunken well shows through,
// and CSS variable font so it matches the app's monospace font.

const craftAgentDarkTheme = {
  ...vscodeTheme,
  '--w-rjv-font-family': 'var(--font-mono, ui-monospace, monospace)',
  '--w-rjv-background-color': 'transparent',
}

const craftAgentLightTheme = {
  ...githubLightTheme,
  '--w-rjv-font-family': 'var(--font-mono, ui-monospace, monospace)',
  '--w-rjv-background-color': 'transparent',
}

// ── Deep parse helper (same as JSONPreviewOverlay) ─────────────────────────
// Recursively parse stringified JSON within JSON values so nested objects
// like {"result": "{\"nested\": \"value\"}"} display as expandable nodes.

function deepParseJson(value: unknown): unknown {
  if (value === null || value === undefined) return value

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return deepParseJson(JSON.parse(trimmed))
      } catch {
        return value
      }
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map(deepParseJson)
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = deepParseJson(val)
    }
    return result
  }

  return value
}

// ── Error boundary ────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Lightweight error boundary so a JsonView failure doesn't crash the whole
 * message — we fall back to the regular CodeBlock instead.
 */
class JsonErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.warn('[MarkdownJsonBlock] JsonView render failed, falling back to CodeBlock:', error)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

// ── Main component ────────────────────────────────────────────────────────

export interface MarkdownJsonBlockProps {
  /** Raw JSON string from the markdown code block */
  code: string
  className?: string
}

export function MarkdownJsonBlock({ code, className }: MarkdownJsonBlockProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = React.useState(false)

  // Try to parse – fall back to syntax-highlighted CodeBlock if invalid JSON
  const parsed = React.useMemo(() => {
    try {
      const raw = JSON.parse(code)
      return deepParseJson(raw) as object
    } catch {
      return null
    }
  }, [code])

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy JSON:', err)
    }
  }, [code])

  if (parsed === null) {
    return <CodeBlock code={code} language="json" mode="full" className={className} />
  }

  const dark = isDarkMode()
  const jsonTheme = dark ? craftAgentDarkTheme : craftAgentLightTheme
  const fallback = <CodeBlock code={code} language="json" mode="full" className={className} />

  return (
    <JsonErrorBoundary fallback={fallback}>
      <div className={cn('relative overflow-hidden rounded-md border border-subtle bg-sunken', className)}>
        {/* Header — matches the CodeBlock well (32px, language · Copy) */}
        <div className="flex h-8 items-center gap-2 border-b border-subtle pl-3 pr-1 text-label-sm text-tertiary">
          <span className="min-w-0 truncate font-mono text-secondary">json</span>
          <span className="flex-1" />
          <TurnIconButton
            aria-label={t('common.copyJson')}
            icon={copied ? <Check className="size-3.5 text-success" /> : <Copy />}
            onClick={handleCopy}
          />
        </div>

        {/* Interactive tree viewer */}
        <div className="overflow-x-auto px-3 py-2 text-mono-ui">
          <JsonView
            value={parsed}
            style={jsonTheme}
            collapsed={2}
            enableClipboard={true}
            displayDataTypes={false}
            shortenTextAfterLength={100}
          >
            {/* Custom copy icon — same as JSONPreviewOverlay */}
            <JsonView.Copied
              render={(props) => {
                const isCopied = (props as Record<string, unknown>)['data-copied']
                return isCopied ? (
                  <Check
                    className="ml-1.5 inline-flex cursor-pointer text-success"
                    size={10}
                    onClick={props.onClick}
                  />
                ) : (
                  <Copy
                    className="ml-1.5 inline-flex cursor-pointer text-tertiary hover:text-foreground"
                    size={10}
                    onClick={props.onClick}
                  />
                )
              }}
            />
          </JsonView>
        </div>
      </div>
    </JsonErrorBoundary>
  )
}
