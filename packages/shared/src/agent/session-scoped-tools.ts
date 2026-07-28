import { getSessionPlansPath } from '../sessions/storage.ts';

export type { BrowserPaneFns } from './browser-tools.ts';
export {
  getSessionScopedToolCallbacks,
  mergeSessionScopedToolCallbacks,
  registerSessionScopedToolCallbacks,
  unregisterSessionScopedToolCallbacks,
} from './session-scoped-tool-callback-registry.ts';
export type { SessionScopedToolCallbacks } from './session-scoped-tool-callback-registry.ts';

const sessionPlanFilePaths = new Map<string, string>();

export function getLastPlanFilePath(sessionId: string): string | null {
  return sessionPlanFilePaths.get(sessionId) ?? null;
}

export function setLastPlanFilePath(sessionId: string, path: string): void {
  sessionPlanFilePaths.set(sessionId, path);
}

export function clearPlanFileState(sessionId: string): void {
  sessionPlanFilePaths.delete(sessionId);
}

export function getSessionPlansDir(workspacePath: string, sessionId: string): string {
  return getSessionPlansPath(workspacePath, sessionId);
}

export function isPathInPlansDir(path: string, workspacePath: string, sessionId: string): boolean {
  return path.startsWith(getSessionPlansDir(workspacePath, sessionId));
}

export function cleanupSessionScopedTools(sessionId: string): void {
  clearPlanFileState(sessionId);
}

export function invalidateAllSessionToolsCaches(): void {}
