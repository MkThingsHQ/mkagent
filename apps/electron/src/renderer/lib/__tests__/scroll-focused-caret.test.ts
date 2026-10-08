import { describe, expect, it } from 'bun:test'
import { scrollFocusedCaretIntoView } from '../scroll-focused-caret'

describe('focused draft scrolling', () => {
  function fixture() {
    let caret = { top: 220, bottom: 240, height: 20 }
    let active = true
    const editor = { contains: () => true }
    const selection = { focusNode: {}, focusOffset: 5 }
    let collapsedRanges = 0
    const scroller = {
      scrollTop: 0,
      contains: () => active,
      getBoundingClientRect: () => ({ top: 100, bottom: 200, height: 100 }),
      ownerDocument: {
        activeElement: { closest: () => editor },
        getSelection: () => selection,
        createRange: () => ({
          setStart: () => {},
          collapse: () => { collapsedRanges++ },
          getBoundingClientRect: () => caret,
        }),
      },
    } as unknown as HTMLElement
    return { scroller, selection, setCaret: (next: typeof caret) => { caret = next }, blur: () => { active = false }, ranges: () => collapsedRanges }
  }

  it('scrolls a caret below/above the resized content region without changing selection', () => {
    const { scroller, selection, setCaret } = fixture()
    scrollFocusedCaretIntoView(scroller)
    expect(scroller.scrollTop).toBe(44)
    expect(selection.focusOffset).toBe(5)
    setCaret({ top: 80, bottom: 100, height: 20 })
    scrollFocusedCaretIntoView(scroller)
    expect(scroller.scrollTop).toBe(20)
  })

  it('leaves visible carets, unfocused drafts, and empty unmeasurable ranges alone', () => {
    const { scroller, setCaret, blur, ranges } = fixture()
    setCaret({ top: 140, bottom: 160, height: 20 })
    scrollFocusedCaretIntoView(scroller)
    expect(scroller.scrollTop).toBe(0)
    setCaret({ top: 0, bottom: 0, height: 0 })
    scrollFocusedCaretIntoView(scroller)
    expect(scroller.scrollTop).toBe(0)
    blur()
    scrollFocusedCaretIntoView(scroller)
    expect(ranges()).toBe(2)
  })
})
