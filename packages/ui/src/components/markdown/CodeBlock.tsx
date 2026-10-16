import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { codeToHtml, bundledLanguages, type BundledLanguage } from 'shiki'
import { Check, Copy, Play } from 'lucide-react'
import { cn } from '../../lib/utils'
import { TurnIconButton } from '../chat/turn/TurnIconButton'
import { useShikiTheme } from '../../context/ShikiThemeContext'
import { useRunCommand } from './RunCommandContext'
import { shellCommandFromBlock } from './shell-command'

export interface CodeBlockProps {
  code: string
  language?: string
  className?: string
  /**
   * Render mode affects code block styling:
   * - 'terminal': Minimal, keeps control chars visible
   * - 'minimal': Clean code, basic styling
   * - 'full': Rich styling with background, copy button, etc.
   */
  mode?: 'terminal' | 'minimal' | 'full'
  /**
   * Force a specific theme. If not provided, detects from document.documentElement.classList
   */
  forcedTheme?: 'light' | 'dark'
}

// Languages to pre-load (most common in chat contexts)
const PRELOADED_LANGUAGES = [
  'javascript', 'typescript', 'python', 'json', 'bash', 'shell',
  'markdown', 'html', 'css', 'sql', 'yaml', 'go', 'rust', 'java',
  'c', 'cpp', 'tsx', 'jsx', 'swift', 'kotlin', 'ruby', 'php'
] as const

// Map common aliases to Shiki language names
const LANGUAGE_ALIASES: Record<string, BundledLanguage> = {
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'sh': 'bash',
  'zsh': 'bash',
  'yml': 'yaml',
  'rb': 'ruby',
  'rs': 'rust',
  'kt': 'kotlin',
  'objective-c': 'objc',
  'objc': 'objc',
}

// Simple LRU cache for highlighted code
const highlightCache = new Map<string, string>()
const CACHE_MAX_SIZE = 200

function getCacheKey(code: string, lang: string, theme: string): string {
  return `${theme}:${lang}:${code}`
}

function isValidLanguage(lang: string): lang is BundledLanguage {
  const normalized = LANGUAGE_ALIASES[lang] || lang
  return normalized in bundledLanguages
}

/**
 * CodeBlock - Syntax highlighted code block using Shiki
 *
 * Uses VS Code's syntax highlighting engine for accurate highlighting.
 * Lazy-loads highlighting and caches results for performance.
 */
export function CodeBlock({ code, language = 'text', className, mode = 'full', forcedTheme }: CodeBlockProps) {
  const { t } = useTranslation()
  const [highlighted, setHighlighted] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [copied, setCopied] = React.useState(false)
  const [started, setStarted] = React.useState(false)
  // Shell/console blocks get "Run in background" where the host provides a runner (the chat transcript)
  const runCommand = useRunCommand()
  const command = runCommand && mode === 'full' ? shellCommandFromBlock(code, language) : null

  // Get shiki theme from context (set by ShikiThemeProvider in the app).
  // This correctly handles edge cases like dark-only themes in light system mode.
  const contextShikiTheme = useShikiTheme()

  // Resolve language alias - keep as string to allow 'text' fallback
  const langLower = language.toLowerCase()
  const resolvedLang: string = LANGUAGE_ALIASES[langLower] || langLower

  React.useEffect(() => {
    let cancelled = false

    async function highlight() {
      // Theme priority:
      // 1. Context theme (from ShikiThemeProvider) - handles supportedModes correctly
      // 2. forcedTheme prop - explicit override for specific use cases
      // 3. DOM detection fallback - backwards compatible default
      let theme: string
      if (contextShikiTheme) {
        theme = contextShikiTheme
      } else if (forcedTheme) {
        theme = forcedTheme === 'dark' ? 'github-dark' : 'github-light'
      } else {
        const isDark = document.documentElement.classList.contains('dark')
        theme = isDark ? 'github-dark' : 'github-light'
      }
      const cacheKey = getCacheKey(code, resolvedLang, theme)

      const cached = highlightCache.get(cacheKey)
      if (cached) {
        if (!cancelled) {
          setHighlighted(cached)
          setIsLoading(false)
        }
        return
      }

      try {
        // Use valid language or fallback to plaintext
        const lang = isValidLanguage(resolvedLang) ? resolvedLang : 'text'

        const html = await codeToHtml(code, {
          lang,
          theme,
        })

        // Cache the result
        if (highlightCache.size >= CACHE_MAX_SIZE) {
          const firstKey = highlightCache.keys().next().value
          if (firstKey) highlightCache.delete(firstKey)
        }
        highlightCache.set(cacheKey, html)

        if (!cancelled) {
          setHighlighted(html)
          setIsLoading(false)
        }
      } catch (error) {
        // Fallback to plain text on error
        console.warn(`Shiki highlighting failed for language "${resolvedLang}":`, error)
        if (!cancelled) {
          setHighlighted(null)
          setIsLoading(false)
        }
      }
    }

    highlight()

    return () => {
      cancelled = true
    }
  }, [code, resolvedLang, forcedTheme, contextShikiTheme])

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }, [code])

  const handleRun = React.useCallback(() => {
    if (!runCommand || !command) return
    runCommand(command)
    setStarted(true)
    setTimeout(() => setStarted(false), 2000)
  }, [runCommand, command])

  // Terminal mode: raw monospace with minimal styling
  if (mode === 'terminal') {
    return (
      <pre className={cn('font-mono text-sm whitespace-pre-wrap', className)}>
        <code>{code}</code>
      </pre>
    )
  }

  // Minimal mode: just syntax highlighting, no chrome
  if (mode === 'minimal') {
    if (isLoading || !highlighted) {
      return (
        <pre className={cn('font-mono text-sm whitespace-pre-wrap', className)}>
          <code>{code}</code>
        </pre>
      )
    }

    return (
      <div
        className={cn('font-mono text-sm [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_code]:!bg-transparent', className)}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    )
  }

  // Full mode: sunken well with a 32px header (language · Copy); long lines scroll inside the
  // well so a code block never widens the page (spec §7.4 code blocks)
  return (
    <div className={cn('relative overflow-hidden rounded-md border border-subtle bg-sunken', className)}>
      <div className="flex h-8 items-center gap-2 border-b border-subtle pl-3 pr-1 text-label-sm text-tertiary">
        <span className="min-w-0 truncate font-mono text-secondary">
          {resolvedLang !== 'text' ? resolvedLang : 'plain text'}
        </span>
        <span className="flex-1" />
        {command && (
          <TurnIconButton
            aria-label={started ? t('chat.runCommandStarted') : t('chat.runCommandInBackground')}
            tooltip
            icon={started ? <Check className="size-3.5 text-success" /> : <Play />}
            onClick={handleRun}
            disabled={started}
          />
        )}
        <TurnIconButton
          aria-label={copied ? t('common.copied') : t('common.copyCode')}
          icon={copied ? <Check className="size-3.5 text-success" /> : <Copy />}
          onClick={handleCopy}
        />
      </div>

      {/* Code content */}
      <div className="overflow-x-auto px-3 py-2 font-mono text-mono-ui leading-5 text-diff">
        {isLoading || !highlighted ? (
          <pre className="m-0 w-max min-w-full font-mono">
            <code>{code}</code>
          </pre>
        ) : (
          <div
            className="w-max min-w-full [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:font-mono [&_code]:!bg-transparent"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        )}
      </div>
    </div>
  )
}

/**
 * InlineCode - Styled inline code span
 * 13px mono on the hover fill, radius-xs; long tokens wrap anywhere so they never widen the
 * column. `inline-code` is a hook for hosts that resize it (14px in the compact answer).
 */
export function InlineCode({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <code className={cn(
      'inline-code rounded-xs bg-fill-hover px-1.25 py-px font-mono text-label wrap-anywhere',
      className
    )}>
      {children}
    </code>
  )
}
