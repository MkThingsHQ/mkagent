/**
 * MarkdownSpreadsheetBlock - Excel-style grid for markdown ```spreadsheet code blocks
 *
 * Renders structured JSON as a spreadsheet with column letters, row numbers,
 * and type-aware cell formatting. No external dependencies beyond React.
 *
 * Expected JSON shape (inline):
 * {
 *   "filename": "Q1_Revenue.xlsx",
 *   "sheetName": "Summary",
 *   "columns": [{ "key": "region", "label": "Region", "type": "text" }],
 *   "rows": [{ "region": "North" }]
 * }
 *
 * File-backed shape (src field):
 * {
 *   "src": "data/revenue.json",
 *   "filename": "Q1_Revenue.xlsx",
 *   "columns": [{ "key": "region", "label": "Region", "type": "text" }]
 * }
 *
 * Falls back to CodeBlock if JSON parsing fails.
 */

import * as React from 'react'
import { Maximize2, Sheet } from 'lucide-react'
import { cn } from '../../lib/utils'
import { CodeBlock } from './CodeBlock'
import { DataTableOverlay } from '../overlay/DataTableOverlay'
import { useScrollFade } from './useScrollFade'
import { TableExportDropdown } from './TableExportDropdown'
import {
  PreviewBlockAction,
  PreviewBlockError,
  PreviewBlockFrame,
  PreviewBlockHeader,
  PreviewBlockLoading,
} from './PreviewBlockChrome'
import { usePlatform } from '../../context/PlatformContext'
import { useTranslation } from 'react-i18next'

// ── Types ────────────────────────────────────────────────────────────────────

interface ColumnDef {
  key: string
  label: string
  type?: 'text' | 'number' | 'currency' | 'percent' | 'formula'
}

interface SpreadsheetData {
  filename?: string
  sheetName?: string
  columns: ColumnDef[]
  rows: Record<string, unknown>[]
}

interface SpreadsheetSpec {
  src?: string
  filename?: string
  sheetName?: string
  columns?: ColumnDef[]
  rows?: Record<string, unknown>[]
}

// ── Cell formatting ──────────────────────────────────────────────────────────

function formatCell(value: unknown, type?: ColumnDef['type']): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-tertiary">—</span>
  switch (type) {
    case 'currency': {
      const num = typeof value === 'number' ? value : Number(value)
      if (isNaN(num)) return String(value)
      return <span className="tabular-nums">{num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
    }
    case 'percent': {
      const pct = typeof value === 'number' ? value : Number(value)
      if (isNaN(pct)) return String(value)
      const formatted = (pct * 100).toFixed(1) + '%'
      const positive = pct > 0
      return <span className={cn('tabular-nums', positive && 'text-success', pct < 0 && 'text-destructive')}>{positive ? '+' : ''}{formatted}</span>
    }
    case 'number':
    case 'formula': {
      const n = typeof value === 'number' ? value : Number(value)
      if (isNaN(n)) return String(value)
      return <span className="tabular-nums">{n.toLocaleString()}</span>
    }
    default:
      return String(value)
  }
}

function isNumericType(type?: string): boolean {
  return type === 'number' || type === 'currency' || type === 'percent' || type === 'formula'
}

function isNumericValue(v: unknown): boolean {
  if (typeof v === 'number') return true
  if (typeof v === 'string') return /^-?[\d,]+\.?\d*%?$/.test(v.replace(/[$€£¥]/g, ''))
  return false
}

// ── Error boundary ───────────────────────────────────────────────────────────

class SpreadsheetErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error) {
    console.warn('[MarkdownSpreadsheetBlock] Render failed, falling back to CodeBlock:', error)
  }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export interface MarkdownSpreadsheetBlockProps {
  code: string
  className?: string
}

export function MarkdownSpreadsheetBlock({ code, className }: MarkdownSpreadsheetBlockProps) {
  const { t } = useTranslation()
  const { onReadFile } = usePlatform()

  // Parse the inline JSON spec (may have src field for file-backed data)
  const spec = React.useMemo<SpreadsheetSpec | null>(() => {
    try {
      const raw = JSON.parse(code)
      if (raw.src || (Array.isArray(raw.columns) && Array.isArray(raw.rows))) {
        return raw as SpreadsheetSpec
      }
      return null
    } catch {
      return null
    }
  }, [code])

  // Load file data when src is present
  const [fileData, setFileData] = React.useState<SpreadsheetData | null>(null)
  const [fileError, setFileError] = React.useState<string | null>(null)
  const [fileLoading, setFileLoading] = React.useState(false)

  React.useEffect(() => {
    if (!spec?.src || !onReadFile) return
    setFileLoading(true)
    setFileError(null)
    onReadFile(spec.src)
      .then((content) => {
        try {
          const raw = JSON.parse(content)
          if (Array.isArray(raw)) {
            setFileData({ rows: raw, columns: [] })
          } else if (raw && typeof raw === 'object') {
            setFileData({
              filename: raw.filename,
              sheetName: raw.sheetName,
              columns: Array.isArray(raw.columns) ? raw.columns : [],
              rows: Array.isArray(raw.rows) ? raw.rows : [],
            })
          } else {
            setFileError('File does not contain valid spreadsheet data')
          }
        } catch {
          setFileError('Failed to parse data file as JSON')
        }
      })
      .catch((err) => {
        setFileError(err instanceof Error ? err.message : 'Failed to read data file')
      })
      .finally(() => setFileLoading(false))
  }, [spec?.src, onReadFile])

  // Merge: inline spec takes precedence, file provides rows
  const parsed = React.useMemo<SpreadsheetData | null>(() => {
    if (!spec) return null
    if (spec.src) {
      if (!fileData) return null
      return {
        filename: spec.filename ?? fileData.filename,
        sheetName: spec.sheetName ?? fileData.sheetName,
        columns: (spec.columns && spec.columns.length > 0) ? spec.columns : fileData.columns,
        rows: fileData.rows,
      }
    }
    if (!Array.isArray(spec.columns) || !Array.isArray(spec.rows)) return null
    return { filename: spec.filename, sheetName: spec.sheetName, columns: spec.columns, rows: spec.rows }
  }, [spec, fileData])

  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const { scrollRef, maskImage } = useScrollFade()

  // A file-backed sheet whose read hasn't started yet (the effect runs after the first paint) shows
  // the loading well instead of flashing the JSON fallback for a frame.
  const awaitingFile = !!spec?.src && !!onReadFile && !fileData && !fileError

  // Loading state for file-backed spreadsheet
  if ((spec?.src && fileLoading) || awaitingFile) {
    const loadingLabel = [spec?.filename, spec?.sheetName].filter(Boolean).join(' — ') || t('spreadsheet.defaultTitle')
    return (
      <PreviewBlockFrame className={className}>
        <PreviewBlockHeader icon={<Sheet />} title={loadingLabel} />
        <PreviewBlockLoading className="py-8">{t('datatable.loadingData')}</PreviewBlockLoading>
      </PreviewBlockFrame>
    )
  }

  // Error state for file-backed spreadsheet
  if (spec?.src && fileError) {
    const errorLabel = [spec.filename, spec.sheetName].filter(Boolean).join(' — ') || t('spreadsheet.defaultTitle')
    return (
      <PreviewBlockFrame className={className}>
        <PreviewBlockHeader icon={<Sheet />} title={errorLabel} />
        <PreviewBlockError>{fileError}</PreviewBlockError>
      </PreviewBlockFrame>
    )
  }

  if (!parsed) {
    return <CodeBlock code={code} language="json" mode="full" className={className} />
  }

  const colLetters = parsed.columns.map((_, i) => String.fromCharCode(65 + i))
  const label = [parsed.filename, parsed.sheetName].filter(Boolean).join(' — ') || t('spreadsheet.defaultTitle')
  const fallback = <CodeBlock code={code} language="json" mode="full" className={className} />

  const tableContent = (maxHeight?: boolean, scrollable?: boolean) => (
    <div
      ref={scrollable ? scrollRef : undefined}
      className={cn(maxHeight && 'max-h-[400px]', 'overflow-y-auto')}
      style={scrollable ? {
        overflowX: 'auto',
        maskImage,
        WebkitMaskImage: maskImage,
      } : { overflowX: 'auto' }}
    >
      <table className="w-max min-w-full text-label text-foreground">
        {/* Column letter headers: the sheet's gutter row */}
        <thead>
          <tr className="border-b border-subtle bg-fill-hover">
            <th className="w-10 border-r border-subtle px-2 py-1 text-center text-caption font-normal text-tertiary" />
            {colLetters.map((letter) => (
              <th key={letter} className="border-r border-subtle px-3 py-1 text-center text-caption font-normal text-tertiary last:border-0">{letter}</th>
            ))}
          </tr>
          {/* Row 1: column labels */}
          <tr className="border-b border-subtle">
            <td className="border-r border-subtle bg-fill-hover px-2 py-1.5 text-center font-mono text-caption font-normal text-tertiary">1</td>
            {parsed.columns.map((col) => (
              <td key={col.key} className="border-r border-subtle px-3 py-1.5 font-semibold last:border-0">{col.label}</td>
            ))}
          </tr>
        </thead>
        <tbody>
          {parsed.rows.map((row, i) => (
            <tr key={i} className="border-b border-subtle last:border-0 transition-colors duration-micro ease-out-subtle hover:bg-fill-hover hover:duration-instant">
              <td className="border-r border-subtle bg-fill-hover px-2 py-1.5 text-center font-mono text-caption font-normal text-tertiary">{i + 2}</td>
              {parsed.columns.map((col) => {
                const val = row[col.key]
                const numeric = isNumericType(col.type) || isNumericValue(val)
                return (
                  <td key={col.key} className={cn(
                    'border-r border-subtle px-3 py-1.5 tabular-nums last:border-0',
                    numeric && 'text-right',
                    col.type === 'formula' && 'text-info',
                  )}>
                    {formatCell(val, col.type)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <SpreadsheetErrorBoundary fallback={fallback}>
      <PreviewBlockFrame className={className}>
        {/* Header: file — sheet · fullscreen */}
        <PreviewBlockHeader icon={<Sheet />} title={label}>
          <PreviewBlockAction
            aria-label={t('common.viewFullscreen')}
            icon={<Maximize2 />}
            onClick={() => setIsFullscreen(true)}
          />
        </PreviewBlockHeader>

        {/* Table with max height and scroll fade */}
        {tableContent(true, true)}
      </PreviewBlockFrame>

      {/* Fullscreen overlay */}
      <DataTableOverlay
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        title={label}
        subtitle={`${t('datatable.rowCount', { count: parsed.rows.length })} × ${t('spreadsheet.colCount', { count: parsed.columns.length })}`}
        headerActions={<TableExportDropdown columns={parsed.columns} rows={parsed.rows} filename={parsed.filename || parsed.sheetName || t('spreadsheet.defaultTitle')} />}
      >
        <div className="px-6">
          <div className="overflow-hidden rounded-lg bg-raised shadow-elev-1">
            {tableContent(false)}
          </div>
        </div>
      </DataTableOverlay>
    </SpreadsheetErrorBoundary>
  )
}
