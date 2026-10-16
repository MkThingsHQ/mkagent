import { describe, expect, it } from 'bun:test'
import { stripRepeatedTitle } from '../strip-repeated-title'

describe('stripRepeatedTitle', () => {
  it('drops a "Title: message" prefix so the title reads once', () => {
    expect(stripRepeatedTitle('Authentication Failed', 'Authentication Failed: Unable to refresh the token')).toBe('Unable to refresh the token')
    expect(stripRepeatedTitle('Error', 'error:  boom')).toBe('boom')
  })

  it('returns an empty body when the body is just the title', () => {
    expect(stripRepeatedTitle('Rate limited', 'Rate limited')).toBe('')
  })

  it('keeps sentences that merely start with the title word', () => {
    expect(stripRepeatedTitle('Error', 'Error rate limit exceeded')).toBe('Error rate limit exceeded')
    expect(stripRepeatedTitle('Error', 'Error-prone config detected')).toBe('Error-prone config detected')
    expect(stripRepeatedTitle('Error', 'Errors occurred while syncing')).toBe('Errors occurred while syncing')
  })

  it('leaves unrelated bodies alone', () => {
    expect(stripRepeatedTitle('Network Error', 'The server closed the connection')).toBe('The server closed the connection')
    expect(stripRepeatedTitle('', 'Anything')).toBe('Anything')
  })
})
