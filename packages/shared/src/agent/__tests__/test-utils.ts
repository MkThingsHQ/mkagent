/** Craft-derived test helpers, trimmed to the Pi-only MkAgent backend surface. */
import type { AgentEvent } from '@mkagent/core/types';
import type { BackendConfig, ChatOptions } from '../backend/types.ts';
import { AbortReason } from '../backend/types.ts';
import type { Workspace } from '../../config/storage.ts';
import type { SessionConfig as Session } from '../../sessions/storage.ts';
import { BaseAgent } from '../base-agent.ts';

export function createMockWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'test-workspace-id',
    name: 'Test Workspace',
    slug: 'workspace',
    rootPath: '/test/workspace',
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-session-id',
    name: 'Test Session',
    workspaceRootPath: '/test/workspace',
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    permissionMode: 'ask',
    ...overrides,
  };
}

export function createMockBackendConfig(overrides: Partial<BackendConfig> = {}): BackendConfig {
  return {
    provider: 'pi',
    workspace: createMockWorkspace(),
    session: createMockSession(),
    model: 'test-model',
    thinkingLevel: 'medium',
    isHeadless: true,
    ...overrides,
  };
}

export class TestAgent extends BaseAgent {
  protected backendName = 'Test';
  public chatCalls: Array<{ message: string; attachments?: unknown[]; options?: ChatOptions }> = [];
  public abortCalls: Array<{ reason?: string }> = [];
  public forceAbortCalls: Array<{ reason: AbortReason }> = [];
  public respondToPermissionCalls: Array<{ requestId: string; allowed: boolean; alwaysAllow?: boolean }> = [];
  private _isProcessing = false;

  constructor(config: BackendConfig) {
    super(config, 'test-model');
  }

  protected async *chatImpl(message: string, attachments?: unknown[], options?: ChatOptions): AsyncGenerator<AgentEvent> {
    this.chatCalls.push({ message, attachments, options });
    this._isProcessing = true;
    try {
      yield { type: 'complete' };
    } finally {
      this._isProcessing = false;
    }
  }

  async abort(reason?: string): Promise<void> { this.abortCalls.push({ reason }); this._isProcessing = false; }
  forceAbort(reason: AbortReason = AbortReason.UserStop): void { this.forceAbortCalls.push({ reason }); this._isProcessing = false; }
  isProcessing(): boolean { return this._isProcessing; }
  respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void {
    this.respondToPermissionCalls.push({ requestId, allowed, alwaysAllow });
  }
  async runMiniCompletion(): Promise<string | null> { return 'Test Response'; }
  async queryLlm(): Promise<import('../llm-tool.ts').LLMQueryResult> { return { text: 'Test LLM Response' }; }
}
