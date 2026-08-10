import { describe, expect, it } from 'bun:test'
import { parseMentions, resolveSourceMentions, stripAllMentions } from '../index.ts'

describe('source mentions', () => {
  it('parses available source slugs once', () => {
    expect(parseMentions('[source:github] [source:github]', [], ['github']).sources)
      .toEqual(['github'])
  })

  it('resolves source mentions without truncating surrounding text', () => {
    expect(resolveSourceMentions('check my emails in [source:gmail]'))
      .toBe('check my emails in [Mentioned source: gmail]')
  })

  it('resolves multiple source mentions', () => {
    expect(resolveSourceMentions('[source:github] and [source:linear]'))
      .toBe('[Mentioned source: github] and [Mentioned source: linear]')
  })

  it('keeps source slugs when stripping legacy mentions', () => {
    expect(stripAllMentions('[skill:commit] and [source:github]'))
      .toBe('commit and github')
  })
})
