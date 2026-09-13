/**
 * Pi SDK settings for MkAgent-embedded sessions.
 *
 * `createAgentSession` defaults to `SettingsManager.create(cwd, agentDir)`, which
 * merges the *working directory's* `.pi/settings.json` (project scope, trusted by
 * default) on top of `agentDir/settings.json`, and persists every SDK-side
 * settings write (e.g. `setModel` → defaultProvider/defaultModel) into the
 * session's `.pi-agent/` folder. Neither is wanted here: MkAgent owns model,
 * thinking level and compaction for its sessions, a repo checked out as the
 * working directory must not be able to flip retry/compaction/tool defaults,
 * and nothing should be written next to the session transcript.
 *
 * The in-memory manager starts from the SDK defaults and pins the retry policy
 * explicitly. The main process surfaces the resulting `auto_retry_*` events —
 * see `packages/shared/src/agent/backend/pi/event-adapter.ts`.
 */
import { SettingsManager } from '@earendil-works/pi-coding-agent';
import { LLM_QUERY_TIMEOUT_MS } from '../../shared/src/agent/llm-tool.ts';

type PiSettings = NonNullable<Parameters<typeof SettingsManager.inMemory>[0]>;

export type MkAgentPiSessionPurpose = 'main' | 'ephemeral';

/**
 * Finish inside the host RPC timeout so the subprocess has time to serialize a
 * targeted result and the host can clear its pending request before its own
 * deadline fires.
 */
export const MKAGENT_PI_EPHEMERAL_QUERY_DEADLINE_MS = LLM_QUERY_TIMEOUT_MS - 5_000;

/**
 * Main-chat retry policy for transient provider/transport errors.
 *
 * Agent-level (`AgentSession._prepareRetry`, classifier `isRetryableAssistantError`
 * in pi-ai): re-runs a failed assistant turn with exponential backoff
 * `baseDelayMs * 2^(attempt-1)`. Four retries wait 2 s + 4 s + 8 s + 16 s ≈ 30 s.
 *
 * Provider-level (`retryProviderRequest` in pi-ai): pre-stream retries for
 * 408/409/429/5xx honoring `retry-after` up to `maxRetryDelayMs`, mirroring the
 * OpenAI/Anthropic SDK default of 2. (Pi SDK default: 0.)
 */
export const MKAGENT_PI_RETRY_SETTINGS = {
  enabled: true,
  maxRetries: 4,
  baseDelayMs: 2_000,
  provider: {
    maxRetries: 2,
    maxRetryDelayMs: 60_000,
  },
} as const;

/**
 * Smaller retry budget for utility sessions (`call_llm`, titles, summaries).
 *
 * These calls have an end-to-end 120-second RPC budget and a 115-second child
 * deadline. In the worst configured case, provider-directed sleeps consume at
 * most 60 seconds (two 10-second sleeps in each of three agent attempts) and
 * agent backoff consumes another 6 seconds, leaving headroom for request and
 * cleanup latency.
 */
export const MKAGENT_PI_EPHEMERAL_RETRY_SETTINGS = {
  enabled: true,
  maxRetries: 2,
  baseDelayMs: 2_000,
  provider: {
    maxRetries: 2,
    maxRetryDelayMs: 10_000,
  },
} as const;

export const MKAGENT_PI_EPHEMERAL_MAX_BACKOFF_MS =
  MKAGENT_PI_EPHEMERAL_RETRY_SETTINGS.provider.maxRetries *
    MKAGENT_PI_EPHEMERAL_RETRY_SETTINGS.provider.maxRetryDelayMs *
    (MKAGENT_PI_EPHEMERAL_RETRY_SETTINGS.maxRetries + 1) +
  MKAGENT_PI_EPHEMERAL_RETRY_SETTINGS.baseDelayMs *
    (2 ** MKAGENT_PI_EPHEMERAL_RETRY_SETTINGS.maxRetries - 1);

/** Settings applied to one Pi session, isolated from project/global Pi files. */
export function buildMkAgentPiSettings(purpose: MkAgentPiSessionPurpose = 'main'): PiSettings {
  const retry = purpose === 'ephemeral'
    ? MKAGENT_PI_EPHEMERAL_RETRY_SETTINGS
    : MKAGENT_PI_RETRY_SETTINGS;

  return {
    retry: {
      enabled: retry.enabled,
      maxRetries: retry.maxRetries,
      baseDelayMs: retry.baseDelayMs,
      provider: { ...retry.provider },
    },
    // PiAgent re-asserts auto-compaction on every subprocess start
    // (requestSetAutoCompaction(true)); keep the SDK default explicit here so
    // the intent is visible next to the retry policy.
    compaction: { enabled: true },
  };
}

/**
 * Fresh in-memory settings manager for one Pi session. Cheap to create; not
 * shared between the main session and `queryLlm` ephemeral sessions so a
 * `setModel` on one can never leak a "default model" into the other.
 */
export function createMkAgentSettingsManager(
  purpose: MkAgentPiSessionPurpose = 'main',
): SettingsManager {
  return SettingsManager.inMemory(buildMkAgentPiSettings(purpose));
}
