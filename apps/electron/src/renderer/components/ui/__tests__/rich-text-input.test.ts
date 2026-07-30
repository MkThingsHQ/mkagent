import { describe, it, expect } from 'bun:test'
import { isEscapeDuringComposition, shouldShowRichTextPlaceholder } from '../rich-text-input'

describe('isEscapeDuringComposition', () => {
  it('returns true for Escape when local composition ref is active', () => {
    expect(isEscapeDuringComposition({ key: 'Escape' }, true)).toBe(true)
  })

  it('returns true for Escape when nativeEvent.isComposing is true', () => {
    expect(
      isEscapeDuringComposition(
        { key: 'Escape', nativeEvent: { isComposing: true } },
        false
      )
    ).toBe(true)
  })

  it('returns true for Escape when event.isComposing is true', () => {
    expect(isEscapeDuringComposition({ key: 'Escape', isComposing: true }, false)).toBe(true)
  })

  it('returns false for Escape when no composition signal is active', () => {
    expect(isEscapeDuringComposition({ key: 'Escape' }, false)).toBe(false)
  })

  it('returns false for non-Escape keys even if composing', () => {
    expect(isEscapeDuringComposition({ key: 'Enter', isComposing: true }, true)).toBe(false)
  })
})

describe('shouldShowRichTextPlaceholder', () => {
  it('shows the placeholder only when the prop, DOM, and composition are empty', () => {
    expect(shouldShowRichTextPlaceholder('', false, false)).toBe(true)
  })

  it('keeps typed DOM text visible while the controlled prop is catching up', () => {
    expect(shouldShowRichTextPlaceholder('', true, false)).toBe(false)
  })

  it('keeps composing text visible before the controlled prop updates', () => {
    expect(shouldShowRichTextPlaceholder('', false, true)).toBe(false)
  })

  it('hides the placeholder when the controlled value is present', () => {
    expect(shouldShowRichTextPlaceholder('hello', false, false)).toBe(false)
  })
})
