/**
 * MarkdownPdfBlock - Renders ```pdf-preview code blocks as inline PDF previews.
 *
 * Loads PDF(s) from file(s) (via `src` or `items` field) and renders the first page
 * using react-pdf. Supports multiple items with a tab bar for switching between them.
 *
 * Expected JSON shapes:
 * Single item:
 * {
 *   "src": "/absolute/path/to/file.pdf",
 *   "title": "Optional title"
 * }
 *
 * Multiple items:
 * {
 *   "title": "Quarterly Reports",
 *   "items": [
 *     { "src": "/path/to/q1.pdf", "label": "Q1 Report" },
 *     { "src": "/path/to/q2.pdf", "label": "Q2 Report" }
 *   ]
 * }
 *
 * Only one Document is mounted at a time. The content area uses a fixed height
 * container to prevent layout shift when switching between items.
 *
 * Inline: Shows first page in a fixed 400px container with bottom fade + expand button.
 * Fullscreen: Opens PDFPreviewOverlay with full page-by-page navigation.
 */

import * as React from 'react'
import { FileText, Maximize2 } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import { CodeBlock } from './CodeBlock'
import { PDFPreviewOverlay } from '../overlay/PDFPreviewOverlay'
import {
  PreviewBlockAction,
  PreviewBlockError,
  PreviewBlockFade,
  PreviewBlockFrame,
  PreviewBlockHeader,
  PreviewBlockLoading,
  PreviewItemNavigator,
} from './PreviewBlockChrome'
import { usePlatform } from '../../context/PlatformContext'
import { useTranslation } from 'react-i18next'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Configure pdf.js worker using Vite's ?url import for cross-platform dev/prod compatibility
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

// ── Types ────────────────────────────────────────────────────────────────────

interface PreviewItem {
  src: string
  label?: string
}
interface PdfPreviewSpec {
  src?: string
  title?: string
  items?: PreviewItem[]
}

// ── Error boundary ───────────────────────────────────────────────────────────

class PdfBlockErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error) {
    console.warn('[MarkdownPdfBlock] Render failed, falling back to CodeBlock:', error)
  }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export interface MarkdownPdfBlockProps {
  code: string
  className?: string
  onCreateRegionAnnotation?: (region: { page?: number; x: number; y: number; w: number; h: number; unit: 'pixel' | 'percent' }) => void
}

export function MarkdownPdfBlock({ code, className, onCreateRegionAnnotation: _onCreateRegionAnnotation }: MarkdownPdfBlockProps) {
  const { t } = useTranslation()
  const { onReadFileBinary } = usePlatform()

  // Parse the JSON spec — supports single src or items array
  const spec = React.useMemo<PdfPreviewSpec | null>(() => {
    try {
      const raw = JSON.parse(code)
      if (raw.items && Array.isArray(raw.items) && raw.items.length > 0) {
        return raw as PdfPreviewSpec
      }
      if (raw.src && typeof raw.src === 'string') {
        return raw as PdfPreviewSpec
      }
      return null
    } catch {
      return null
    }
  }, [code])

  // Normalize to items array (backward compat)
  const items = React.useMemo<PreviewItem[]>(() => {
    if (!spec) return []
    if (spec.items && spec.items.length > 0) return spec.items
    if (spec.src) return [{ src: spec.src }]
    return []
  }, [spec])

  const [activeIndex, setActiveIndex] = React.useState(0)
  const [isFullscreen, setIsFullscreen] = React.useState(false)

  // Content cache: src path → loaded Uint8Array (master copy, never passed to react-pdf directly)
  const [contentCache, setContentCache] = React.useState<Record<string, Uint8Array>>({})
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const activeItem = items[activeIndex]
  const activePdfData = activeItem ? contentCache[activeItem.src] : undefined

  // Load active item's content when it changes
  React.useEffect(() => {
    if (!activeItem?.src || !onReadFileBinary) return
    if (contentCache[activeItem.src]) {
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    onReadFileBinary(activeItem.src)
      .then((data) => {
        // Store a copy — react-pdf transfers ArrayBuffers to workers, detaching the original
        setContentCache((prev) => ({ ...prev, [activeItem.src]: new Uint8Array(data) }))
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to read PDF file')
      })
      .finally(() => setLoading(false))
  }, [activeItem?.src, onReadFileBinary, contentCache])

  // Stable file objects per item (ref ensures Documents don't remount on re-render).
  // Each Document gets its own Uint8Array copy since react-pdf transfers the ArrayBuffer.
  const fileObjsRef = React.useRef<Record<string, { data: Uint8Array }>>({})
  for (const [src, data] of Object.entries(contentCache)) {
    if (!fileObjsRef.current[src]) {
      fileObjsRef.current[src] = { data: new Uint8Array(data) }
    }
  }

  const activeFileObj = activeItem ? fileObjsRef.current[activeItem.src] : undefined

  // Fullscreen overlay: always provide a fresh copy (the overlay's Document will also transfer it)
  const loadPdfData = React.useCallback(async (path: string) => {
    if (contentCache[path]) return new Uint8Array(contentCache[path])
    if (!onReadFileBinary) throw new Error('Cannot load PDF')
    return onReadFileBinary(path)
  }, [contentCache, onReadFileBinary])

  // Invalid spec → fall back to code block
  if (!spec || items.length === 0) {
    return <CodeBlock code={code} language="json" mode="full" className={className} />
  }

  const fallback = <CodeBlock code={code} language="json" mode="full" className={className} />

  return (
    <PdfBlockErrorBoundary fallback={fallback}>
      <PreviewBlockFrame className={className}>
        {/* Header: title · item navigator · fullscreen */}
        <PreviewBlockHeader icon={<FileText />} title={spec.title || t('preview.pdfPreview')}>
          <PreviewItemNavigator items={items} activeIndex={activeIndex} onSelect={setActiveIndex} />
          <PreviewBlockAction
            aria-label={t('common.viewFullscreen')}
            icon={<Maximize2 />}
            onClick={() => setIsFullscreen(true)}
          />
        </PreviewBlockHeader>

        {/* Content area: fixed height prevents layout shift on item switch. The page (white, as
            pdf.js paints it) sits on the well like a sheet in a document viewer. */}
        <div className="relative h-[400px] overflow-hidden">
          {/* Active Document (only one mounted at a time) */}
          {activeFileObj && (
            <div className="flex items-start justify-center p-4">
              <Document
                file={activeFileObj}
                loading={<PreviewBlockLoading>{t('common.rendering')}</PreviewBlockLoading>}
                error={<PreviewBlockError>{t('preview.failedToRenderPdf')}</PreviewBlockError>}
              >
                <Page
                  pageNumber={1}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  width={500}
                  className="shadow-elev-1"
                />
              </Document>
            </div>
          )}

          {/* Loading state for uncached active item */}
          {!activePdfData && loading && (
            <PreviewBlockLoading className="h-full">{t('common.loading')}</PreviewBlockLoading>
          )}

          {/* Error state for uncached active item */}
          {!activePdfData && !loading && error && (
            <PreviewBlockError>{error}</PreviewBlockError>
          )}

          {/* Bottom fade: the page dissolves into the well */}
          {activePdfData && <PreviewBlockFade />}
        </div>
      </PreviewBlockFrame>

      {/* Fullscreen overlay — passes items for multi-item navigation */}
      <PDFPreviewOverlay
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        filePath={activeItem!.src}
        items={items}
        initialIndex={activeIndex}
        loadPdfData={loadPdfData}
      />
    </PdfBlockErrorBoundary>
  )
}
