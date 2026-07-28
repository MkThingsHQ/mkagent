import { describe, expect, it } from 'bun:test';
import { pickProviderAppropriateMiniModel } from './pick-mini-model.ts';

function createMockRegistry(
  providers: Record<string, Array<{ id: string; name: string; provider?: string }>>,
) {
  const allModels = Object.entries(providers).flatMap(([provider, models]) =>
    models.map(model => ({ ...model, provider })),
  );
  return {
    find(provider: string, modelId: string) {
      return providers[provider]?.find(model => model.id === modelId || model.name === modelId);
    },
    getAll() {
      return allModels;
    },
  } as any;
}

describe('pickProviderAppropriateMiniModel', () => {
  it('returns the first resolvable OpenAI preferred model', () => {
    const registry = createMockRegistry({
      openai: [
        { id: 'gpt-5.5', name: 'GPT 5.5' },
        { id: 'gpt-5.2', name: 'GPT 5.2' },
      ],
    });
    expect(pickProviderAppropriateMiniModel('openai', registry, false)).toBe('gpt-5.5');
  });

  it('returns undefined for unknown providers and empty registries', () => {
    const registry = createMockRegistry({});
    expect(pickProviderAppropriateMiniModel('unknown', registry, false)).toBeUndefined();
  });
});
