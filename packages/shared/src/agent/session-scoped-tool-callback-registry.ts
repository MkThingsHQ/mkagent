import type {
  BackgroundTaskInfo,
  ListSessionsOptions,
  ListSessionsResult,
  SendAgentMessageResult,
  SessionInfo,
  AuthRequest,
} from '@mkagent/session-tools-core';
import { debug } from '../utils/debug.ts';
import type { BrowserPaneFns } from './browser-tools.ts';
import type { LLMQueryRequest, LLMQueryResult } from './llm-tool.ts';
import type { SpawnSessionFn } from './spawn-session-tool.ts';

export interface SessionScopedToolCallbacks {
  onPlanSubmitted?: (planPath: string) => void;
  onAuthRequest?: (request: AuthRequest) => void;
  queryFn?: (request: LLMQueryRequest) => Promise<LLMQueryResult>;
  spawnSessionFn?: SpawnSessionFn;
  browserPaneFns?: BrowserPaneFns;
  getSessionInfoFn?: (sessionId?: string) => SessionInfo | null;
  listSessionsFn?: (options?: ListSessionsOptions) => ListSessionsResult;
  listBackgroundTasksFn?: (sessionId?: string) => BackgroundTaskInfo[];
  sendAgentMessageFn?: (
    sessionId: string,
    message: string,
    attachments?: Array<{ path: string; name?: string }>
  ) => Promise<SendAgentMessageResult>;
  /** Activate a source during source_test and report when its tools are ready. */
  activateSourceInSessionFn?: (sourceSlug: string) => Promise<{
    ok: boolean;
    reason?: string;
    availability?: 'immediate' | 'next-turn';
  }>;
}

const registry = new Map<string, SessionScopedToolCallbacks>();

export function registerSessionScopedToolCallbacks(
  sessionId: string,
  callbacks: SessionScopedToolCallbacks
): void {
  registry.set(sessionId, callbacks);
  debug('session-scoped-tools', `Registered callbacks for session ${sessionId}`);
}

export function mergeSessionScopedToolCallbacks(
  sessionId: string,
  callbacks: Partial<SessionScopedToolCallbacks>
): void {
  registry.set(sessionId, { ...registry.get(sessionId), ...callbacks });
}

export function unregisterSessionScopedToolCallbacks(sessionId: string): void {
  registry.delete(sessionId);
}

export function getSessionScopedToolCallbacks(
  sessionId: string
): SessionScopedToolCallbacks | undefined {
  return registry.get(sessionId);
}
