import { describe, expect, it } from 'bun:test';
import {
  detectProvider,
  getAvailableProviders,
  isProviderAvailable,
  providerTypeToAgentProvider,
} from '../factory.ts';

describe('Pi-only backend registry', () => {
  it('registers only Pi', () => {
    expect(getAvailableProviders()).toEqual(['pi']);
    expect(isProviderAvailable('pi')).toBe(true);
  });

  it('routes every retained provider preset through Pi', () => {
    expect(detectProvider('api_key')).toBe('pi');
    expect(providerTypeToAgentProvider('pi_compat')).toBe('pi');
    expect(providerTypeToAgentProvider('pi')).toBe('pi');
  });
});
