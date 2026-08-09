import type { SessionToolContext } from '@mkagent/session-tools-core';
import { getSessionScopedToolCallbacks } from './session-scoped-tool-callback-registry.ts';

export function attachSessionSelfManagementBindings(
  context: SessionToolContext,
  sessionId: string
): void {
  Object.defineProperty(context, 'listSessions', {
    get: () => getSessionScopedToolCallbacks(sessionId)?.listSessionsFn,
    configurable: true,
  });
  Object.defineProperty(context, 'listBackgroundTasks', {
    get() {
      const fn = getSessionScopedToolCallbacks(sessionId)?.listBackgroundTasksFn;
      return fn ? (id?: string) => fn(id ?? sessionId) : undefined;
    },
    configurable: true,
  });
  Object.defineProperty(context, 'sendAgentMessage', {
    get: () => getSessionScopedToolCallbacks(sessionId)?.sendAgentMessageFn,
    configurable: true,
  });
  Object.defineProperty(context, 'getSessionInfo', {
    get() {
      const fn = getSessionScopedToolCallbacks(sessionId)?.getSessionInfoFn;
      return fn ? (id?: string) => fn(id ?? sessionId) : undefined;
    },
    configurable: true,
  });
  Object.defineProperty(context, 'activateSourceInSession', {
    get: () => getSessionScopedToolCallbacks(sessionId)?.activateSourceInSessionFn,
    configurable: true,
  });
}
