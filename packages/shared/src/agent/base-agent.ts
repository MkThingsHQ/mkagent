import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentEvent } from '@mkagent/core/types';
import type { FileAttachment } from '../utils/files.ts';
import { getDefaultLlmConnection, getLlmConnections } from '../config/storage.ts';
import type { Workspace } from '../config/storage.ts';
import { parseMentions, resolveFileMentions, resolveSkillMentions } from '../mentions/index.ts';
import { getSessionPath, getSessionPlansPath, getSessionDataPath } from '../sessions/storage.ts';
import { loadAllSkills } from '../skills/storage.ts';
import { expandPath } from '../utils/paths.ts';
import { buildRegenerateTitlePrompt, buildTitlePrompt, validateTitle } from '../utils/title-generator.ts';
import type {
  AgentBackend,
  BackendConfig,
  ChatOptions,
  PermissionCallback,
  PlanCallback,
  PostInitResult,
  RecoveryMessage,
} from './backend/types.ts';
import { AbortReason } from './backend/types.ts';
import { PermissionManager } from './core/permission-manager.ts';
import { buildCallLlmRequest, type LLMQueryRequest, type LLMQueryResult } from './llm-tool.ts';
import type { PermissionMode } from './mode-manager.ts';
import { DEFAULT_THINKING_LEVEL, normalizeThinkingLevel, type ThinkingLevel } from './thinking-levels.ts';

export interface MiniAgentConfig {
  enabled: boolean;
  tools: readonly string[];
  minimizeThinking: boolean;
}

export interface SpawnSessionRequest {
  prompt: string;
  name?: string;
  llmConnection?: string;
  model?: string;
  permissionMode?: PermissionMode;
  thinkingLevel?: ThinkingLevel;
  workingDirectory?: string;
  attachments?: Array<{ path: string; name?: string }>;
}

export interface SpawnSessionResult {
  sessionId: string;
  name: string;
  status: 'started';
  connection?: string;
  model?: string;
}

export interface SpawnSessionHelpResult {
  connections: Array<{
    slug: string;
    name: string;
    isDefault: boolean;
    providerType: string;
    models: string[];
    defaultModel?: string;
  }>;
  defaults: { defaultConnection: string | null; permissionMode: string };
}

export const MINI_AGENT_TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'] as const;

export abstract class BaseAgent implements AgentBackend {
  protected abstract backendName: string;
  protected _supportsBranching = true;
  protected config: BackendConfig;
  protected workingDirectory: string;
  protected _sessionId: string;
  protected _model: string;
  protected _thinkingLevel: ThinkingLevel;
  protected permissionManager: PermissionManager;
  protected _currentTurnUserMessage: string | null = null;

  onPermissionRequest: PermissionCallback | null = null;
  onPlanSubmitted: PlanCallback | null = null;
  onPermissionModeChange: ((mode: PermissionMode) => void) | null = null;
  onDebug: ((message: string) => void) | null = null;
  onBackendAuthRequired: ((reason: string) => void) | null = null;
  onSpawnSession: ((request: SpawnSessionRequest) => Promise<SpawnSessionResult>) | null = null;

  constructor(config: BackendConfig, defaultModel: string) {
    this.config = config;
    this.workingDirectory = config.session?.workingDirectory ?? config.workspace.rootPath;
    this._sessionId = config.session?.id ?? `agent-${Date.now()}`;
    this._model = config.model ?? defaultModel;
    this._thinkingLevel = normalizeThinkingLevel(config.thinkingLevel) ?? DEFAULT_THINKING_LEVEL;
    this.permissionManager = new PermissionManager({
      workspaceId: config.workspace.id,
      sessionId: this._sessionId,
      workingDirectory: this.workingDirectory,
      plansFolderPath: getSessionPlansPath(config.workspace.rootPath, this._sessionId),
      dataFolderPath: getSessionDataPath(config.workspace.rootPath, this._sessionId),
    });
  }

  get supportsBranching(): boolean {
    return this._supportsBranching;
  }

  protected debug(message: string): void {
    this.onDebug?.(message);
  }

  protected startConfigWatcher(): void {}
  protected stopConfigWatcher(): void {}

  getModel(): string {
    return this._model;
  }

  setModel(model: string): void {
    this._model = model;
  }

  getThinkingLevel(): ThinkingLevel {
    return this._thinkingLevel;
  }

  setThinkingLevel(level: ThinkingLevel): void {
    this._thinkingLevel = level;
  }

  getPermissionMode(): PermissionMode {
    return this.permissionManager.getPermissionMode();
  }

  setPermissionMode(mode: PermissionMode): void {
    this.permissionManager.setPermissionMode(mode);
    this.onPermissionModeChange?.(mode);
  }

  cyclePermissionMode(): PermissionMode {
    const mode = this.permissionManager.cyclePermissionMode();
    this.onPermissionModeChange?.(mode);
    return mode;
  }

  isInSafeMode(): boolean {
    return this.getPermissionMode() === 'safe';
  }

  getWorkspace(): Workspace {
    return this.config.workspace;
  }

  setWorkspace(workspace: Workspace): void {
    this.config.workspace = workspace;
  }

  getSessionId(): string | null {
    return this._sessionId;
  }

  setSessionId(sessionId: string | null): void {
    this._sessionId = sessionId ?? `agent-${Date.now()}`;
  }

  getCurrentTurnUserMessage(): string | null {
    return this._currentTurnUserMessage;
  }

  clearHistory(): void {}
  resetPrerequisiteState(): void {}

  updateWorkingDirectory(path: string): void {
    this.workingDirectory = path;
    if (this.config.session) this.config.session.workingDirectory = path;
    this.permissionManager.updateWorkingDirectory(path);
  }

  updateSdkCwd(path: string): void {
    if (this.config.session) this.config.session.sdkCwd = path;
  }

  getPermissionManager(): PermissionManager {
    return this.permissionManager;
  }

  isMiniAgent(): boolean {
    return this.config.systemPromptPreset === 'mini';
  }

  getMiniAgentConfig(): MiniAgentConfig {
    const enabled = this.isMiniAgent();
    return { enabled, tools: enabled ? MINI_AGENT_TOOLS : [], minimizeThinking: enabled };
  }

  protected buildRecoveryContext(): string | null {
    return this.formatContextBlock('conversation_recovery', this.config.getRecoveryMessages?.());
  }

  protected buildBranchSeedContext(messages?: RecoveryMessage[]): string | null {
    return this.formatContextBlock('branch_seed_context', messages?.slice(-24));
  }

  private formatContextBlock(tag: string, messages?: RecoveryMessage[]): string | null {
    if (!messages?.length) return null;
    const body = messages
      .map(message => {
        const role = message.type === 'user' ? 'User' : 'Assistant';
        const content = message.content.length > 1200
          ? `${message.content.slice(0, 1200)}...[truncated]`
          : message.content;
        return `[${role}]: ${content}`;
      })
      .join('\n\n');
    return `<${tag}>\n${body}\n</${tag}>`;
  }

  protected clearSessionForRecovery(): void {
    this.config.onSdkSessionIdCleared?.();
  }

  protected getSessionStoragePath(): string | undefined {
    if (!this.config.session?.id) return undefined;
    return getSessionPath(this.config.workspace.rootPath, this.config.session.id);
  }

  async postInit(): Promise<PostInitResult> {
    return { authInjected: true };
  }

  async ensureBranchReady(): Promise<void> {}

  dispose(): void {
    this.destroy();
  }

  destroy(): void {
    this.stopConfigWatcher();
    this.permissionManager.clearWhitelists();
  }

  private extractSkillPaths(message: string): {
    skillPaths: Map<string, string>;
    cleanMessage: string;
    missingSkills: string[];
  } {
    const skills = loadAllSkills(this.config.workspace.rootPath, this.config.session?.workingDirectory);
    const parsed = parseMentions(message, skills.map(skill => skill.slug), []);
    const skillPaths = new Map<string, string>();
    for (const slug of parsed.skills) {
      const skill = skills.find(candidate => candidate.slug === slug);
      const skillPath = skill ? join(skill.path, 'SKILL.md') : undefined;
      if (skillPath && existsSync(skillPath)) skillPaths.set(slug, skillPath);
    }
    const names = new Map(skills.map(skill => [skill.slug, skill.metadata.name]));
    const resolved = resolveFileMentions(
      resolveSkillMentions(message, names),
      this.config.session?.workingDirectory ?? this.workingDirectory
    ).trim();
    return {
      skillPaths,
      cleanMessage: resolved || (skillPaths.size ? 'Follow the mentioned Skill instructions.' : ''),
      missingSkills: parsed.invalidSkills,
    };
  }

  private formatSkillDirective(skillPaths: Map<string, string>): string {
    if (!skillPaths.size) return '';
    const paths = [...skillPaths.entries()].map(([slug, path]) => `- ${path} (${slug})`).join('\n');
    return `Read these Skill files before acting:\n${paths}`;
  }

  async *chat(
    message: string,
    attachments?: FileAttachment[],
    options?: ChatOptions
  ): AsyncGenerator<AgentEvent> {
    const { skillPaths, cleanMessage, missingSkills } = this.extractSkillPaths(message);
    if (missingSkills.length) {
      yield { type: 'error', message: `Skill(s) not found: ${missingSkills.join(', ')}` };
      yield { type: 'complete' };
      return;
    }
    const branchContext = this.buildBranchSeedContext(this.config.getBranchSeedMessages?.());
    if (branchContext) this.config.markBranchSeedApplied?.();
    const effectiveMessage = [branchContext, this.formatSkillDirective(skillPaths), cleanMessage]
      .filter(Boolean)
      .join('\n\n');
    this._currentTurnUserMessage = cleanMessage;
    try {
      yield* this.chatImpl(effectiveMessage, attachments, options);
    } finally {
      this._currentTurnUserMessage = null;
    }
  }

  protected abstract chatImpl(
    message: string,
    attachments?: FileAttachment[],
    options?: ChatOptions
  ): AsyncGenerator<AgentEvent>;

  abstract abort(reason?: string): Promise<void>;
  abstract forceAbort(reason: AbortReason): void;
  abstract isProcessing(): boolean;
  abstract respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void;
  abstract runMiniCompletion(prompt: string): Promise<string | null>;
  abstract queryLlm(request: LLMQueryRequest): Promise<LLMQueryResult>;

  interruptForHandoff(reason: AbortReason): void {
    this.forceAbort(reason);
  }

  redirect(_message: string): boolean {
    this.forceAbort(AbortReason.Redirect);
    return false;
  }

  protected async preExecuteCallLlm(input: Record<string, unknown>): Promise<LLMQueryResult> {
    const request = await buildCallLlmRequest(input, {
      backendName: this.backendName,
      sessionPath: getSessionPath(this.config.workspace.rootPath, this._sessionId),
      validateModel: this.validateCallLlmModel?.bind(this),
    });
    return this.queryLlm(request);
  }

  protected validateCallLlmModel?(modelId: string): string | undefined;

  protected async preExecuteSpawnSession(
    input: Record<string, unknown>
  ): Promise<SpawnSessionResult | SpawnSessionHelpResult> {
    if (input.help) return this.getSpawnSessionHelp();
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
    if (!prompt) throw new Error('prompt is required when not in help mode.');
    if (!this.onSpawnSession) throw new Error('spawn_session is not available in this context.');
    return this.onSpawnSession({
      prompt,
      name: input.name as string | undefined,
      llmConnection: input.llmConnection as string | undefined,
      model: input.model as string | undefined,
      permissionMode: input.permissionMode as PermissionMode | undefined,
      thinkingLevel: input.thinkingLevel as ThinkingLevel | undefined,
      workingDirectory: typeof input.workingDirectory === 'string'
        ? expandPath(input.workingDirectory)
        : undefined,
      attachments: input.attachments as SpawnSessionRequest['attachments'],
    });
  }

  protected getSpawnSessionHelp(): SpawnSessionHelpResult {
    const defaultConnection = getDefaultLlmConnection();
    return {
      connections: getLlmConnections().map(connection => ({
        slug: connection.slug,
        name: connection.name,
        isDefault: connection.slug === defaultConnection,
        providerType: connection.providerType,
        models: (connection.models ?? []).map(model => typeof model === 'string' ? model : model.id),
        defaultModel: connection.defaultModel,
      })),
      defaults: { defaultConnection, permissionMode: this.getPermissionMode() },
    };
  }

  async generateTitle(message: string, options?: { language?: string }): Promise<string | null> {
    try {
      return validateTitle(await this.runMiniCompletion(buildTitlePrompt(message, options)));
    } catch {
      return null;
    }
  }

  async regenerateTitle(
    recentUserMessages: string[],
    lastAssistantResponse: string,
    options?: { language?: string }
  ): Promise<string | null> {
    try {
      const prompt = buildRegenerateTitlePrompt(recentUserMessages, lastAssistantResponse, options);
      return validateTitle(await this.runMiniCompletion(prompt));
    } catch {
      return null;
    }
  }

  getSummarizeCallback(): (prompt: string) => Promise<string | null> {
    return this.runMiniCompletion.bind(this);
  }
}

export { AbortReason };
