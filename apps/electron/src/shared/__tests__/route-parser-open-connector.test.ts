import { describe, expect, it } from 'bun:test'
import {
  buildCompoundRoute,
  buildRouteFromNavigationState,
  parseCompoundRoute,
  parseRouteToNavigationState,
} from '../route-parser'

describe('route-parser: OpenConnector routes', () => {
  it('supports the content-only default route', () => {
    expect(parseCompoundRoute('openConnector')).toEqual({
      navigator: 'openConnector',
      details: null,
    })
    expect(parseRouteToNavigationState('openConnector')).toEqual({ navigator: 'openConnector' })
  })

  it('parses each exposed console section', () => {
    expect(parseRouteToNavigationState('openConnector/providers')).toEqual({
      navigator: 'openConnector',
      section: 'providers',
    })
    expect(parseRouteToNavigationState('openConnector/actions')).toEqual({
      navigator: 'openConnector',
      section: 'actions',
    })
    expect(parseRouteToNavigationState('openConnector/runs')).toEqual({
      navigator: 'openConnector',
      section: 'runs',
    })
  })

  it('roundtrips OpenConnector routes', () => {
    expect(buildCompoundRoute({ navigator: 'openConnector', details: null })).toBe('openConnector')
    expect(buildCompoundRoute({
      navigator: 'openConnector',
      openConnectorSection: 'actions',
      details: null,
    })).toBe('openConnector/actions')
    expect(buildRouteFromNavigationState({ navigator: 'openConnector', section: 'runs' })).toBe('openConnector/runs')
  })

  it('rejects unknown or over-nested sections', () => {
    expect(parseCompoundRoute('openConnector/anything')).toBeNull()
    expect(parseCompoundRoute('openConnector/providers/extra')).toBeNull()
  })
})
