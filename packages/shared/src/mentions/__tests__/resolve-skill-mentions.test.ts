/**
 * Tests for resolveSkillMentions semantic markers that replace bracket mentions
 * with readable context instead of stripping them.
 *
 * Fix for: skill mentions used as nouns in sentences getting stripped,
 * producing truncated messages (e.g. "find the root cause in" instead of
 * "find the root cause in [Mentioned skill: Datadog API (slug: datadog-api)]").
 */
import { describe, it, expect } from 'bun:test'
import { resolveSkillMentions, stripAllMentions } from '../index.ts'

// ============================================================================
// resolveSkillMentions
// ============================================================================

describe('resolveSkillMentions', () => {
  const skillNames = new Map([
    ['commit', 'Git Commit'],
    ['review-pr', 'Review PR'],
    ['datadog-api', 'Datadog API'],
  ])

  describe('basic resolution', () => {
    it('resolves simple skill mention with display name', () => {
      expect(resolveSkillMentions('[skill:commit] do this', skillNames))
        .toBe('[Mentioned skill: Git Commit (slug: commit)] do this')
    })

    it('resolves skill with hyphenated slug', () => {
      expect(resolveSkillMentions('[skill:review-pr] check this', skillNames))
        .toBe('[Mentioned skill: Review PR (slug: review-pr)] check this')
    })

    it('falls back to slug when not in map', () => {
      expect(resolveSkillMentions('[skill:unknown-skill] do this', skillNames))
        .toBe('[Mentioned skill: unknown-skill (slug: unknown-skill)] do this')
    })
  })

  describe('workspace ID handling', () => {
    it('resolves skill with workspace ID containing space', () => {
      expect(resolveSkillMentions('[skill:My Workspace:commit] do this', skillNames))
        .toBe('[Mentioned skill: Git Commit (slug: commit)] do this')
    })

    it('resolves skill with workspace ID containing hyphen', () => {
      expect(resolveSkillMentions('[skill:my-workspace:commit] do this', skillNames))
        .toBe('[Mentioned skill: Git Commit (slug: commit)] do this')
    })

    it('resolves skill with workspace ID containing underscore', () => {
      expect(resolveSkillMentions('[skill:my_workspace:commit] do this', skillNames))
        .toBe('[Mentioned skill: Git Commit (slug: commit)] do this')
    })

    it('resolves skill with workspace ID containing dot', () => {
      expect(resolveSkillMentions('[skill:my.workspace:commit] do this', skillNames))
        .toBe('[Mentioned skill: Git Commit (slug: commit)] do this')
    })
  })

  describe('sentence preservation (the bug this fixes)', () => {
    it('preserves sentence when skill is used as a noun', () => {
      expect(resolveSkillMentions('find the root cause in [skill:datadog-api]', skillNames))
        .toBe('find the root cause in [Mentioned skill: Datadog API (slug: datadog-api)]')
    })

    it('preserves sentence with skill in the middle', () => {
      expect(resolveSkillMentions('use [skill:commit] to save changes', skillNames))
        .toBe('use [Mentioned skill: Git Commit (slug: commit)] to save changes')
    })
  })

  describe('multiple mentions', () => {
    it('resolves multiple skill mentions', () => {
      const result = resolveSkillMentions('[skill:commit] and [skill:review-pr]', skillNames)
      expect(result).toBe('[Mentioned skill: Git Commit (slug: commit)] and [Mentioned skill: Review PR (slug: review-pr)]')
    })

    it('resolves multiple skills with different workspace IDs', () => {
      const result = resolveSkillMentions('[skill:My Workspace:commit] and [skill:other-ws:review-pr]', skillNames)
      expect(result).toContain('[Mentioned skill: Git Commit (slug: commit)]')
      expect(result).toContain('[Mentioned skill: Review PR (slug: review-pr)]')
    })
  })

  describe('passthrough', () => {
    it('leaves text without mentions unchanged', () => {
      expect(resolveSkillMentions('no mentions here', skillNames))
        .toBe('no mentions here')
    })

    it('leaves file mentions untouched', () => {
      expect(resolveSkillMentions('[file:index.ts]', skillNames))
        .toBe('[file:index.ts]')
    })
  })
})

// ============================================================================
// stripAllMentions — now replaces with slug instead of empty string
// ============================================================================

describe('stripAllMentions - slug replacement', () => {
  it('replaces skill mention with slug', () => {
    expect(stripAllMentions('[skill:commit] do this'))
      .toBe('commit do this')
  })

  it('replaces skill with workspace ID with slug', () => {
    expect(stripAllMentions('[skill:My Workspace:commit] do this'))
      .toBe('commit do this')
  })

  it('preserves sentence structure', () => {
    expect(stripAllMentions('find bug in [skill:datadog-api]'))
      .toBe('find bug in datadog-api')
  })
})
