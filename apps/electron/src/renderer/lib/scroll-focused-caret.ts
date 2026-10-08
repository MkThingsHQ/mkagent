import { getRootCssZoom } from './input-viewport'

/** Keep a focused draft caret visible after keyboard/layout changes. Only scroll
 * the draft region, never the window or selection (including active IME ranges).
 * Do not run on scroll: users must remain free to inspect earlier attachments. */
export function scrollFocusedCaretIntoView(scroller: HTMLElement): void {
  const document = scroller.ownerDocument
  const editor = document.activeElement?.closest('[contenteditable="true"]')
  if (!editor || !scroller.contains(editor)) return
  const selection = document.getSelection()
  if (!selection?.focusNode || !editor.contains(selection.focusNode)) return
  const range = document.createRange()
  range.setStart(selection.focusNode, selection.focusOffset)
  range.collapse(true)
  const caret = range.getBoundingClientRect()
  if (caret.height === 0) return
  const bounds = scroller.getBoundingClientRect()
  const zoom = getRootCssZoom()
  const margin = Math.min(4 * zoom, bounds.height / 4)
  if (caret.bottom > bounds.bottom - margin) {
    scroller.scrollTop += (caret.bottom - bounds.bottom + margin) / zoom
  } else if (caret.top < bounds.top + margin) {
    scroller.scrollTop -= (bounds.top + margin - caret.top) / zoom
  }
}
