/**
 * Tests for PiAgent.queryLlm — the subprocess RPC that powers `call_llm`.
 *
 * These tests are the drift guard for issue #596. The main-process side used to
 * route queryLlm through the mini_completion envelope which only carried `prompt`,
 * silently dropping model/systemPrompt/outputSchema/etc. The round-trip invariant
 * test below ensures the full request shape propagates end-to-end and fails loudly
 * if someone adds a new LLMQueryRequest field and forgets to plumb it through.
 */
import { describe, expect, it } from 'bun:test';
import { PiAgent } from '../pi-agent.ts';
import type { BackendConfig } from '../backend/types.ts';
import type { LLMQueryRequest, LLMQueryResult } from '../llm-tool.ts';
import { getCredentialManager } from '../../credentials/index.ts';

function createConfig(overrides: Partial<BackendConfig> = {}): BackendConfig {
  return {
    provider: 'pi',
    workspace: {
      id: 'ws-test',
      name: 'Test Workspace',
      rootPath: '/tmp/mkagent-test',
    } as any,
    session: {
      id: 'session-test',
      workspaceRootPath: '/tmp/mkagent-test',
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    } as any,
    isHeadless: true,
    ...overrides,
  };
}

/**
 * Install a minimal subprocess stub so ensureSubprocess() resolves immediately
 * and send() captures outbound messages without hitting real stdin.
 */
function installFakeSubprocess(agent: PiAgent): { sent: Array<Record<string, unknown>> } {
  const sent: Array<Record<string, unknown>> = [];
  (agent as any).ensureSubprocess = async () => {};
  (agent as any).send = (cmd: Record<string, unknown>) => {
    sent.push(cmd);
  };
  return { sent };
}

/**
 * queryLlm awaits ensureSubprocess() before it calls send(), so a microtask
 * has to drain before the outbound envelope is captured.
 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('PiAgent.queryLlm — subprocess RPC round-trip', () => {
  it('sends the complete OAuth credential to Pi before a query', async () => {
    const manager = getCredentialManager();
    const originalGetLlmOAuth = manager.getLlmOAuth;
    manager.getLlmOAuth = async () => ({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 123456789,
    });

    const agent = new PiAgent(createConfig({
      authType: 'oauth',
      connectionSlug: 'claude-max',
      runtime: { piAuthProvider: 'anthropic' },
    }));
    const { sent } = installFakeSubprocess(agent);

    try {
      const pending = agent.queryLlm({ prompt: 'hi' });
      await flushMicrotasks();
      await Bun.sleep(0);

      expect(sent[0]).toEqual({
        type: 'token_update',
        piAuth: {
          provider: 'anthropic',
          credential: {
            type: 'oauth',
            access: 'access-token',
            refresh: 'refresh-token',
            expires: 123456789,
          },
        },
      });
      expect(sent[1]?.type).toBe('llm_query');

      (agent as any).handleLine(JSON.stringify({
        type: 'llm_query_result',
        id: sent[1]!.id,
        result: { text: 'ok' },
      }));
      await pending;
    } finally {
      manager.getLlmOAuth = originalGetLlmOAuth;
      agent.destroy();
    }
  });

  it('persists OAuth credentials refreshed by Pi without dropping the ID token', async () => {
    const manager = getCredentialManager();
    const originalGetLlmOAuth = manager.getLlmOAuth;
    const originalSetLlmOAuth = manager.setLlmOAuth;
    let saved: Parameters<typeof manager.setLlmOAuth>[1] | undefined;
    manager.getLlmOAuth = async () => ({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: 1,
      idToken: 'identity-token',
    });
    manager.setLlmOAuth = async (_slug, credentials) => {
      saved = credentials;
    };

    const agent = new PiAgent(createConfig({
      authType: 'oauth',
      connectionSlug: 'chatgpt-plus',
      runtime: { piAuthProvider: 'openai-codex' },
    }));

    try {
      (agent as any).handleLine(JSON.stringify({
        type: 'oauth_credential_update',
        provider: 'openai-codex',
        previousRefresh: 'old-refresh',
        credential: {
          type: 'oauth',
          access: 'new-access',
          refresh: 'new-refresh',
          expires: 999,
        },
      }));
      await flushMicrotasks();

      expect(saved).toEqual({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresAt: 999,
        idToken: 'identity-token',
      });
    } finally {
      manager.getLlmOAuth = originalGetLlmOAuth;
      manager.setLlmOAuth = originalSetLlmOAuth;
      agent.destroy();
    }
  });

  it('propagates the full LLMQueryRequest shape over the llm_query RPC unchanged', async () => {
    const agent = new PiAgent(createConfig());
    const { sent } = installFakeSubprocess(agent);

    const request: LLMQueryRequest = {
      prompt: 'Summarize this transcript',
      systemPrompt: 'You are a concise summarizer.',
      model: 'pi/gpt-5-mini',
      maxTokens: 512,
      temperature: 0.3,
      outputSchema: { type: 'object', properties: { title: { type: 'string' } } },
    };

    // Start the query and complete it by injecting a result for the captured id.
    const pending = agent.queryLlm(request);
    await flushMicrotasks();

    expect(sent).toHaveLength(1);
    const outbound = sent[0]!;
    expect(outbound.type).toBe('llm_query');
    expect(typeof outbound.id).toBe('string');

    // DRIFT GUARD: the outbound envelope must carry the entire request shape
    // byte-for-byte. If someone adds a field to LLMQueryRequest but doesn't
    // propagate it, this fails — prompting them to revisit queryLlm.
    expect(JSON.stringify(outbound.request)).toBe(JSON.stringify(request));

    // Resolve the pending query so the test doesn't hang.
    (agent as any).handleLine(JSON.stringify({
      type: 'llm_query_result',
      id: outbound.id,
      result: { text: 'ok', model: 'pi/gpt-5-mini' },
    }));

    const result = await pending;
    expect(result).toEqual({ text: 'ok', model: 'pi/gpt-5-mini' });

    agent.destroy();
  });

  it('resolves queryLlm with the exact returned text and model', async () => {
    const agent = new PiAgent(createConfig());
    const { sent } = installFakeSubprocess(agent);

    const pending = agent.queryLlm({ prompt: 'hi' });
    await flushMicrotasks();
    const id = sent[0]!.id as string;

    const expected: LLMQueryResult = {
      text: 'hello world',
      model: 'pi/gpt-5-mini',
      inputTokens: 7,
      outputTokens: 3,
    };

    (agent as any).handleLine(JSON.stringify({
      type: 'llm_query_result',
      id,
      result: expected,
    }));

    const result = await pending;
    expect(result).toEqual(expected);
    expect((agent as any).pendingLlmQueries.size).toBe(0);

    agent.destroy();
  });

  it('rejects queryLlm with a timeout message when no result arrives in time', async () => {
    const agent = new PiAgent(createConfig());
    installFakeSubprocess(agent);

    // Shrink the wait so we don't actually block for 120s in the test.
    // The implementation uses LLM_QUERY_TIMEOUT_MS via setTimeout; we intercept
    // setTimeout to fire the timer synchronously-ish.
    const originalSetTimeout = globalThis.setTimeout;
    (globalThis as any).setTimeout = ((fn: () => void) => {
      return originalSetTimeout(fn, 1);
    }) as typeof setTimeout;

    try {
      let rejection: Error | null = null;
      try {
        await agent.queryLlm({ prompt: 'hi' });
      } catch (err) {
        rejection = err as Error;
      }

      expect(rejection).not.toBeNull();
      expect(rejection!.message).toMatch(/timed out/i);
      expect((agent as any).pendingLlmQueries.size).toBe(0);
    } finally {
      (globalThis as any).setTimeout = originalSetTimeout;
    }

    agent.destroy();
  });

  it('rejects all pending queryLlm calls when the subprocess exits', async () => {
    const agent = new PiAgent(createConfig());
    installFakeSubprocess(agent);

    const p1 = agent.queryLlm({ prompt: 'one' });
    const p2 = agent.queryLlm({ prompt: 'two' });
    await flushMicrotasks();

    expect((agent as any).pendingLlmQueries.size).toBe(2);

    // Simulate subprocess death (the exit handler clears pending queries).
    (agent as any).handleSubprocessExit(1, null);

    const [r1, r2] = await Promise.allSettled([p1, p2]);
    expect(r1.status).toBe('rejected');
    expect(r2.status).toBe('rejected');
    expect((r1 as PromiseRejectedResult).reason.message).toMatch(/subprocess exited/i);
    expect((r2 as PromiseRejectedResult).reason.message).toMatch(/subprocess exited/i);
    expect((agent as any).pendingLlmQueries.size).toBe(0);

    agent.destroy();
  });
});
