import { describe, expect, it } from 'bun:test'
import '../../../tests/setup/register-pi-model-resolver.ts'
import {
  authTypeRequiresEndpoint,
  authTypeToCredentialStorageType,
  getDefaultModelForConnection,
  getDefaultModelsForConnection,
  isCompatProvider,
  isLocalConnection,
  isPiProvider,
} from '../llm-connections.ts'

describe('Pi-only LLM connections', () => {
  it('returns provider-filtered Pi models and a default from that list', () => {
    const models = getDefaultModelsForConnection('pi', 'anthropic')
    const ids = models.map(model => typeof model === 'string' ? model : model.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids).toContain(getDefaultModelForConnection('pi', 'anthropic'))
  })

  it('identifies native and compatible Pi providers', () => {
    expect(isPiProvider('pi')).toBe(true)
    expect(isPiProvider('pi_compat')).toBe(true)
    expect(isCompatProvider('pi_compat')).toBe(true)
    expect(isCompatProvider('pi')).toBe(false)
  })

  it('keeps the Lite authentication boundary explicit', () => {
    expect(authTypeToCredentialStorageType('api_key')).toBe('api_key')
    expect(authTypeToCredentialStorageType('api_key_with_endpoint')).toBe('api_key')
    expect(authTypeToCredentialStorageType('none')).toBeNull()
    expect(authTypeRequiresEndpoint('api_key_with_endpoint')).toBe(true)
    expect(authTypeRequiresEndpoint('api_key')).toBe(false)
  })

  it('recognizes loopback endpoints for keyless local models', () => {
    expect(isLocalConnection({ baseUrl: 'http://127.0.0.1:11434/v1' })).toBe(true)
    expect(isLocalConnection({ baseUrl: 'http://[::1]:11434/v1' })).toBe(true)
    expect(isLocalConnection({ baseUrl: 'https://models.example.com/v1' })).toBe(false)
  })
})
