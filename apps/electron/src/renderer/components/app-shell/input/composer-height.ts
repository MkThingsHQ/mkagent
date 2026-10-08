import { getStructuredInputMaxHeight } from './structured-height'

/** The freeform budget includes its action row, not just the editable text. */
export function getComposerMaxHeight(availableHeight: number, mode: 'freeform' | 'structured'): number {
  if (!Number.isFinite(availableHeight)) return mode === 'freeform' ? 584 : 480
  const available = Math.max(0, availableHeight)
  return mode === 'freeform'
    ? Math.min(584, Math.floor(available * 0.66))
    : Math.min(available, getStructuredInputMaxHeight(available))
}
