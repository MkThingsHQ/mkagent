import { expect, it } from 'bun:test';
import { createAgentSession, createExtensionRuntime, SessionManager, type ModelRuntime, type ResourceLoader } from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream, type AssistantMessage, type Model } from '@earendil-works/pi-ai';
import { createMkAgentSettingsManager } from './session-settings.ts';

it('the installed SDK batches A/B/C at one model boundary and a later steer at the next', async () => {
  const model: Model<'openai-responses'> = {
    id: 'offline-steering-test', name: 'Offline', api: 'openai-responses', provider: 'openai',
    baseUrl: 'https://invalid.test', reasoning: false, input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096,
  };
  const resourceLoader: ResourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }), getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => 'Offline steering test', getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [], extendResources: () => {}, reload: async () => {},
  };
  const { session } = await createAgentSession({
    cwd: import.meta.dir, model, settingsManager: createMkAgentSettingsManager(),
    sessionManager: SessionManager.inMemory(import.meta.dir), resourceLoader, tools: [],
    modelRuntime: {
      hasConfiguredAuth: () => true, getModel: () => model, getAvailableSnapshot: () => [model],
      streamSimple: () => { throw new Error('Provider/network access is forbidden'); },
    } as unknown as ModelRuntime,
  });
  const calls: string[][] = [];
  const releases: (() => void)[] = [];
  session.agent.streamFunction = (_model, context, options) => {
    calls.push(context.messages.filter(m => m.role === 'user').map(m =>
      typeof m.content === 'string' ? m.content : m.content.filter(c => c.type === 'text').map(c => c.text).join('')));
    const stream = createAssistantMessageEventStream();
    let finished = false;
    const finish = (reason: 'stop' | 'aborted' = 'stop') => {
      if (finished) return;
      finished = true;
      const message: AssistantMessage = {
        role: 'assistant', content: [{ type: 'text', text: 'done' }], api: model.api, provider: model.provider,
        model: model.id, timestamp: Date.now(), stopReason: reason,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      };
      stream.push({ type: 'start', partial: { ...message, content: [], stopReason: 'pending' } });
      if (reason === 'aborted') stream.push({ type: 'error', reason, error: message });
      else stream.push({ type: 'done', reason, message });
    };
    releases.push(() => finish());
    options?.signal?.addEventListener('abort', () => finish('aborted'), { once: true });
    if (options?.signal?.aborted) finish('aborted');
    return stream;
  };
  const waitForCalls = async (count: number) => {
    for (let i = 0; calls.length < count && i < 100; i++) await Bun.sleep(1);
    expect(calls).toHaveLength(count);
  };
  const turn = session.prompt('initial');
  try {
    await waitForCalls(1);
    for (const text of ['A', 'B', 'C']) await session.steer(text);
    expect(calls).toHaveLength(1); // No interrupt/debounce: first stream still owns its call.
    releases[0]!();
    await waitForCalls(2);
    expect(calls[1]).toEqual(['initial', 'A', 'B', 'C']);
    await session.steer('D');
    expect(calls[1]).not.toContain('D');
    releases[1]!();
    await waitForCalls(3);
    expect(calls[2]).toEqual(['initial', 'A', 'B', 'C', 'D']);
    releases[2]!();
    await turn;
    expect(calls).toHaveLength(3);
  } finally {
    session.clearQueue();
    await session.abort();
    await turn;
    session.dispose();
  }
}, 5000);
