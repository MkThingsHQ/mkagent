import { expect, it } from 'bun:test'
import { fitPrTabCount, visiblePrTabIndexes } from '../pr-watch/tab-layout'

it('reserves overflow space and keeps the active PR tab accessible', () => {
  expect(fitPrTabCount([60, 60, 60, 60], 200, 40)).toBe(2)
  expect(visiblePrTabIndexes(4, 2, 3)).toEqual([0, 3])
  expect(visiblePrTabIndexes(4, 0, 3)).toEqual([3])
  expect(fitPrTabCount([60, 60], 124, 40)).toBe(2)
  expect(visiblePrTabIndexes(2, 5, 0)).toEqual([0, 1])
})
