/**
 * Integration coverage for Pi's real AgentSession auto-retry sequence flowing
 * through PiEventAdapter.
 *
 * The provider is a deterministic in-memory AssistantMessageEventStream. The
 * explicit resource loader, settings manager, session manager, and model
 * runtime keep these tests independent of disk state, credentials, and network.
 */
import { describe, expect, it } from 'bun:test';
import type { AgentEvent as MkAgentEvent } from '@mkagent/core/types';
import {
  createAgentSession,
  createExtensionRuntime,
  SessionManager,
  SettingsManager,
  type AgentSessionEvent,
  type ModelRuntime,
  type ResourceLoader,
} from '@earendil-works/pi-coding-agent';
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Model,
  type StopReason,
} from '@earendil-works/pi-ai';
import { PiEventAdapter } from '../backend/pi/event-adapter.ts';

const TEST_MODEL: Model<'openai-responses'> = {
  id: 'retry-integration-model',
  name: 'Retry integration model',
  provider: 'openai',
  api: 'openai-responses',
  baseUrl: 'https://invalid.test',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 4_096,
};

const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
} as const;

interface Attempt {
  text?: string;
  error?: string;
  stopReason?: Exclude<StopReason, 'pending' | 'error' | 'aborted'>;
}

interface TraceEntry {
  sdkEvent: AgentSessionEvent;
  adapted: MkAgentEvent[];
  completedQueue: boolean;
}

interface ScenarioResult {
  callCount: number;
  trace: TraceEntry[];
  events: MkAgentEvent[];
  queueCompletionSdkEvents: AgentSessionEvent['type'][];
  isHoldingTurn: boolean;
  hasExtraQueueCompletion: boolean;
}

function createNoIoResourceLoader(): ResourceLoader {
  return {
    getExtensions: () => ({
      extensions: [],
      errors: [],
      runtime: createExtensionRuntime(),
    }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => 'Retry integration test',
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

function createNoNetworkModelRuntime(): ModelRuntime {
  // AgentSession only needs these methods because the test supplies an explicit
  // model and replaces the agent stream function before prompting. Throwing in
  // streamSimple makes any accidental provider/network path fail immediately.
  return {
    hasConfiguredAuth: () => true,
    getModel: () => TEST_MODEL,
    getAvailableSnapshot: () => [TEST_MODEL],
    streamSimple: () => {
      throw new Error('Unexpected model runtime stream: integration test must stay offline');
    },
  } as unknown as ModelRuntime;
}

function createAssistantMessage(attempt: Attempt): AssistantMessage {
  const stopReason = attempt.error ? 'error' : (attempt.stopReason ?? 'stop');
  return {
    role: 'assistant',
    content: attempt.text ? [{ type: 'text', text: attempt.text }] : [],
    provider: TEST_MODEL.provider,
    api: TEST_MODEL.api,
    model: TEST_MODEL.id,
    timestamp: Date.now(),
    stopReason,
    errorMessage: attempt.error,
    usage: ZERO_USAGE,
  };
}

/** Emit a protocol-valid stream with an optional partial text before failure. */
function createAttemptStream(attempt: Attempt): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  queueMicrotask(() => {
    const message = createAssistantMessage(attempt);
    const emptyPartial: AssistantMessage = {
      ...message,
      content: [],
      stopReason: 'pending',
      errorMessage: undefined,
    };
    stream.push({ type: 'start', partial: emptyPartial });

    if (attempt.text) {
      const textPartial: AssistantMessage = {
        ...emptyPartial,
        content: [{ type: 'text', text: attempt.text }],
      };
      stream.push({
        type: 'text_start',
        contentIndex: 0,
        partial: { ...emptyPartial, content: [{ type: 'text', text: '' }] },
      });
      stream.push({
        type: 'text_delta',
        contentIndex: 0,
        delta: attempt.text,
        partial: textPartial,
      });
      stream.push({
        type: 'text_end',
        contentIndex: 0,
        content: attempt.text,
        partial: textPartial,
      });
    }

    if (attempt.error) {
      stream.push({ type: 'error', reason: 'error', error: message });
    } else {
      stream.push({ type: 'done', reason: attempt.stopReason ?? 'stop', message });
    }
  });

  return stream;
}

function requireTurnIds(events: Array<{ turnId?: string }>): string[] {
  return events.map((event, index) => {
    if (!event.turnId) {
      throw new Error(`Expected adapted text event ${index} to have a turnId`);
    }
    return event.turnId;
  });
}

async function runScenario(
  attempts: Attempt[],
  options: { cancelOnFirstBackoff?: boolean } = {},
): Promise<ScenarioResult> {
  const settingsManager = SettingsManager.inMemory({
    retry: {
      enabled: true,
      maxRetries: 2,
      // Real SDK timers exercise the actual continuation path while keeping the
      // complete three-attempt exhaustion case below 20 ms of configured waits.
      baseDelayMs: 5,
    },
    compaction: { enabled: false },
  });
  const { session } = await createAgentSession({
    cwd: import.meta.dir,
    model: TEST_MODEL,
    modelRuntime: createNoNetworkModelRuntime(),
    resourceLoader: createNoIoResourceLoader(),
    settingsManager,
    sessionManager: SessionManager.inMemory(import.meta.dir),
    tools: [],
  });

  let callCount = 0;
  session.agent.streamFunction = () => {
    const attempt = attempts[callCount++];
    if (!attempt) {
      throw new Error(`Unexpected provider attempt ${callCount}`);
    }
    return createAttemptStream(attempt);
  };

  const adapter = new PiEventAdapter();
  adapter.startTurn();
  const trace: TraceEntry[] = [];
  let abortScheduled = false;
  let abortPromise: Promise<void> | undefined;

  const unsubscribe = session.subscribe((sdkEvent) => {
    const adapted = [...adapter.adaptEvent(sdkEvent)];
    const completedQueue = adapter.shouldCompleteQueue(sdkEvent.type === 'agent_end');
    trace.push({ sdkEvent, adapted, completedQueue });

    if (
      options.cancelOnFirstBackoff &&
      !abortScheduled &&
      sdkEvent.type === 'auto_retry_start'
    ) {
      abortScheduled = true;
      // The SDK creates its retry AbortController immediately after emitting
      // auto_retry_start. Defer one microtask so abort() cancels that real
      // backoff rather than racing ahead of controller creation.
      queueMicrotask(() => {
        abortPromise = session.abort();
        void abortPromise.catch(() => {});
      });
    }
  });

  try {
    await session.prompt('Exercise the retry integration path');
    if (abortPromise) await abortPromise;

    return {
      callCount,
      trace,
      events: trace.flatMap(entry => entry.adapted),
      queueCompletionSdkEvents: trace
        .filter(entry => entry.completedQueue)
        .map(entry => entry.sdkEvent.type),
      isHoldingTurn: adapter.isHoldingTurn,
      // The caller consumes each completion signal once. There must be no
      // latent signal that could close a later turn's queue.
      hasExtraQueueCompletion: adapter.shouldCompleteQueue(false),
    };
  } finally {
    unsubscribe();
    adapter.resetRecoveryState();
    session.dispose();
  }
}

describe('Pi SDK auto-retry integration', () => {
  it('discards failed partial text and completes with the retried answer', async () => {
    const result = await runScenario([
      { text: 'failed partial ', error: 'terminated' },
      { text: 'good answer' },
    ]);

    expect(result.callCount).toBe(2);

    const deltas = result.events.filter(event => event.type === 'text_delta');
    const discards = result.events.filter(event => event.type === 'text_discard');
    const completedText = result.events.filter(event => event.type === 'text_complete');
    const deltaTurnIds = requireTurnIds(deltas);
    const [failedTurnId, recoveredTurnId] = deltaTurnIds;
    if (!failedTurnId || !recoveredTurnId) {
      throw new Error('Expected failed and recovered text deltas');
    }
    expect(deltas).toMatchObject([
      { type: 'text_delta', text: 'failed partial ' },
      { type: 'text_delta', text: 'good answer' },
    ]);
    expect(discards).toEqual([
      { type: 'text_discard', turnId: failedTurnId },
    ]);
    expect(completedText).toMatchObject([
      { type: 'text_complete', text: 'good answer', turnId: recoveredTurnId },
    ]);
    expect(failedTurnId).not.toBe(recoveredTurnId);

    const retryStart = result.trace.find(entry => entry.sdkEvent.type === 'auto_retry_start');
    expect(retryStart?.adapted).toEqual([
      {
        type: 'retry',
        phase: 'backoff',
        message: expect.stringContaining('Retrying'),
      },
    ]);
    const retriedAgentStart = result.trace.find(
      entry => entry.sdkEvent.type === 'agent_start' && entry.adapted.length > 0,
    );
    expect(retriedAgentStart?.adapted).toEqual([{ type: 'retry', phase: 'active' }]);
    const successfulRetryEnd = result.trace.find(
      entry => entry.sdkEvent.type === 'auto_retry_end',
    );
    expect(successfulRetryEnd?.sdkEvent).toMatchObject({
      type: 'auto_retry_end',
      success: true,
      attempt: 1,
    });
    expect(successfulRetryEnd?.adapted).toEqual([
      { type: 'retry', phase: 'end' },
      { type: 'info', message: 'Recovered after 1 retry' },
    ]);
    expect(
      result.events.filter(event => event.type === 'error' || event.type === 'typed_error'),
    ).toHaveLength(0);
    expect(result.events.filter(event => event.type === 'complete')).toHaveLength(1);
    expect(result.queueCompletionSdkEvents).toEqual(['agent_end']);
    expect(result.isHoldingTurn).toBe(false);
    expect(result.hasExtraQueueCompletion).toBe(false);
  });

  it('discards every failed attempt and surfaces one terminal error after exhaustion', async () => {
    const result = await runScenario([
      { text: 'First partial. ', error: 'terminated' },
      { text: 'Different partial. ', error: 'terminated' },
      { text: 'Final partial. ', error: 'terminated' },
    ]);

    expect(result.callCount).toBe(3);

    const deltas = result.events.filter(event => event.type === 'text_delta');
    const discards = result.events.filter(event => event.type === 'text_discard');
    const deltaTurnIds = requireTurnIds(deltas);
    expect(deltas.map(event => event.text)).toEqual([
      'First partial. ',
      'Different partial. ',
      'Final partial. ',
    ]);
    expect(new Set(deltaTurnIds).size).toBe(3);
    expect(discards.map(event => event.turnId)).toEqual(deltaTurnIds);
    expect(result.events.filter(event => event.type === 'text_complete')).toHaveLength(0);

    expect(result.events.filter(event => event.type === 'retry').map(event => event.phase)).toEqual([
      'backoff',
      'active',
      'backoff',
      'active',
      'end',
    ]);
    const typedErrors = result.events.filter(event => event.type === 'typed_error');
    expect(typedErrors).toMatchObject([
      { type: 'typed_error', error: { code: 'network_error', originalError: 'terminated' } },
    ]);
    expect(typedErrors).toHaveLength(1);
    expect(result.events.filter(event => event.type === 'complete')).toHaveLength(1);

    const terminalAgentEnd = result.trace
      .filter(entry => entry.sdkEvent.type === 'agent_end')
      .at(-1);
    expect(terminalAgentEnd?.adapted.map(event => event.type)).toEqual([
      'retry',
      'typed_error',
      'complete',
    ]);
    expect(terminalAgentEnd?.adapted[0]).toEqual({ type: 'retry', phase: 'end' });

    // Pi emits a descriptive failed auto_retry_end after the terminal agent_end.
    // It must stay silent or the UI would receive a duplicate error/completion.
    const trailingRetryEnd = result.trace.find(
      entry => entry.sdkEvent.type === 'auto_retry_end',
    );
    expect(trailingRetryEnd?.adapted).toEqual([]);
    expect(result.queueCompletionSdkEvents).toEqual(['agent_end']);
    expect(result.isHoldingTurn).toBe(false);
    expect(result.hasExtraQueueCompletion).toBe(false);
  });

  it('ends retry state, releases the held error, and completes the queue when backoff is cancelled', async () => {
    const result = await runScenario(
      [{ error: 'fetch failed' }],
      { cancelOnFirstBackoff: true },
    );

    expect(result.callCount).toBe(1);
    expect(result.events.filter(event => event.type === 'retry')).toEqual([
      {
        type: 'retry',
        phase: 'backoff',
        message: expect.stringContaining('Retrying'),
      },
      { type: 'retry', phase: 'end' },
    ]);

    const cancelledRetryEnd = result.trace.find(
      entry => entry.sdkEvent.type === 'auto_retry_end',
    );
    expect(cancelledRetryEnd?.sdkEvent).toMatchObject({
      type: 'auto_retry_end',
      success: false,
      finalError: 'Retry cancelled',
    });
    expect(cancelledRetryEnd?.adapted.map(event => event.type)).toEqual([
      'retry',
      'typed_error',
      'complete',
    ]);
    expect(cancelledRetryEnd?.adapted[0]).toEqual({ type: 'retry', phase: 'end' });
    expect(cancelledRetryEnd?.adapted[1]).toMatchObject({
      type: 'typed_error',
      error: { code: 'network_error', originalError: 'fetch failed' },
    });

    expect(result.events.filter(event => event.type === 'complete')).toHaveLength(1);
    expect(result.queueCompletionSdkEvents).toEqual(['auto_retry_end']);
    expect(result.isHoldingTurn).toBe(false);
    expect(result.hasExtraQueueCompletion).toBe(false);
  });
});
