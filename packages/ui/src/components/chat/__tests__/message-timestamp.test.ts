import { describe, expect, it } from 'bun:test'
import { formatMessageTimestamp } from '../message-timestamp'

describe('formatMessageTimestamp', () => {
  it('formats a timestamp in local time with zero-padded fields', () => {
    const date = new Date(2026, 0, 2, 3, 4, 5)

    expect(formatMessageTimestamp(date.getTime())).toBe('2026-01-02 03:04:05')
  })
})
