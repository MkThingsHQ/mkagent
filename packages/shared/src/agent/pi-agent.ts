/**
 * Pi Backend (Subprocess RPC Client)
 *
 * Thin subprocess client for the Pi coding agent. Spawns a pi-agent-server
 * subprocess and communicates via JSONL over stdin/stdout.
 *
 * The subprocess runs the Pi SDK (@earendil-works/pi-coding-agent) in-process,
 * handles tool wrapping, permission enforcement, and LLM queries.
 * This file manages subprocess lifecycle, JSONL protocol, event forwarding,
 * and session tool routing.
 *
 * Auth is API key based. Keys are retrieved from the credential manager
 * and passed to the subprocess during initialization.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import type { AgentEvent } from '@mkagent/core/types';
import type { FileAttachment } from '../utils/files.ts';
import { getProxyEnvVars } from '../config/proxy-env.ts';

import type {
  BackendConfig,
  BackendRuntimeUpdate,
  ChatOptions,
} from './backend/types.ts';
import { AbortReason } from './backend/types.ts';
import { getBackendRuntime } from './backend/internal/driver-types.ts';

import type { PermissionMode } from './mode-manager.ts';
import type { ThinkingLevel } from './thinking-levels.ts';

// Import models from centralized registry
import { getModelById } from '../config/models.ts';

// BaseAgent provides common functionality
import { BaseAgent } from './base-agent.ts';
import type { Workspace } from '../config/storage.ts';

// Event adapter
import { PiEventAdapter } from './backend/pi/event-adapter.ts';
import { EventQueue } from './backend/event-queue.ts';

// System prompt for MkAgent context
import { getSystemPrompt } from '../prompts/system.ts';
import { getCoAuthorPreference } from '../config/preferences.ts';

// Credential manager for token storage
import { getCredentialManager } from '../credentials/manager.ts';

// Session-scoped tool callbacks
import {
  mergeSessionScopedToolCallbacks,
  unregisterSessionScopedToolCallbacks,
  setLastPlanFilePath,
  getSessionScopedToolCallbacks,
} from './session-scoped-tools.ts';
import { attachSessionSelfManagementBindings } from './session-self-management-bindings.ts';

// Session tool proxy definitions (for registering with subprocess)
import { getSessionToolProxyDefs, SESSION_TOOL_NAMES } from './backend/pi/session-tool-defs.ts';

// Session tool registry (for executing proxy tool calls)
import {
  SESSION_BACKEND_TOOL_NAMES,
  SESSION_TOOL_REGISTRY,
  type ToolResult as SessionToolResult,
} from '@mkagent/session-tools-core';
import type { SessionToolContext } from '@mkagent/session-tools-core';
import { createPiContext } from './pi-context.ts';
import { getPermissionModeDiagnostics } from './mode-manager.ts';

// call_llm pre-execution pipeline

// Path utilities
import { join } from 'path';
import { homedir } from 'os';

// Session storage (plans folder path)
import { getSessionDataPath, getSessionPath, getSessionPlansPath } from '../sessions/storage.ts';

// Error typing
import { parseError, type AgentError } from './errors.ts';

// Centralized PreToolUse pipeline
import { runPreToolUseChecks, type PreToolUseCheckResult } from './core/pre-tool-use.ts';
import { getRtkPath } from './core/rtk-detector.ts';
import { getRtkEnabled, getBrowserToolEnabled } from '../config/storage.ts';
import type { RtkContext } from './core/rtk-rewrite.ts';

// Workspace slug extraction for skill qualification
import { extractWorkspaceSlug } from '../utils/workspace.ts';

// LLM tool types
import { LLM_QUERY_TIMEOUT_MS, type LLMQueryRequest, type LLMQueryResult } from './llm-tool.ts';
import { executeBrowserToolCommand } from './browser-tool-runtime.ts';
import { saveBinaryResponse } from '../utils/binary-detection.ts';

// ============================================================
// PiAgent Implementation
// ============================================================

/** Backend-executed session tools currently supported by PiAgent. */
export const PI_BACKEND_SESSION_TOOL_NAMES = new Set<string>([
  'call_llm',
  'spawn_session',
  'browser_tool',
]);

/**
 * Map a transport `err.code` to an agent-facing string for `browser_tool` failures.
 * Returns null for unknown codes so callers can fall back to the raw `err.message`.
 *
 * Receiver-side check: keyed on `err.code === 'X'`, never `instanceof CodedError` —
 * the transport reconstructs a plain `Error` with `.code` attached.
 */
function mapBrowserToolErrorCode(code: string): string | null {
  switch (code) {
    case 'BROWSER_NO_CAPABLE_CLIENT':
    case 'CAPABILITY_UNAVAILABLE':
      return 'No connected desktop client supports browser tools, or no client is currently connected. ' +
        'Ask the user to open this workspace from the MkAgent desktop app.';
    case 'CLIENT_DISCONNECTED':
      return 'The desktop client that owned this browser session disconnected. ' +
        'Ask the user to reconnect and retry.';
    case 'CLIENT_REQUEST_TIMEOUT':
      return 'Browser operation timed out (>30s). The desktop client may be unresponsive.';
    case 'BROWSER_INSTANCE_NOT_OWNED':
      return 'That browser instance ID doesn\'t belong to this session. ' +
        'Use `windows` to list owned instances, or `open` to create a new one.';
    case 'BROWSER_REMOTE_UPLOAD_NOT_SUPPORTED':
      return 'File upload from a remote agent is not supported. ' +
        'Ask the user to attach the file to the session.';
    case 'BROWSER_REMOTE_EVALUATE_BLOCKED':
      return 'JavaScript evaluation is disabled on this desktop client. ' +
        'Ask the user to enable it in settings.';
    default:
      return null;
  }
}

/**
 * Backend implementation using the Pi coding agent SDK via subprocess.
 *
 * Spawns a pi-agent-server subprocess and communicates via JSONL protocol.
 * Extends BaseAgent for common functionality (permission mode,
 * planning heuristics, config watching, usage tracking).
 */
export class PiAgent extends BaseAgent {
  protected backendName = 'MkAgent Backend';

  // ============================================================
  // Subprocess State
  // ============================================================

  // Subprocess process handle
  private subprocess: ChildProcess | null = null;
  private readline: ReadlineInterface | null = null;
  private subprocessReady: Promise<void> | null = null;
  private subprocessReadyResolve: (() => void) | null = null;

  // Pi session ID (managed by subprocess, reported back)
  private piSessionId: string | null = null;

  // Callback server port (managed by subprocess)
  private callbackPort: number = 0;

  // State
  private _isProcessing: boolean = false;
  private abortReason?: AbortReason;

  // Event adapter
  private adapter: PiEventAdapter;

  // Event queue for streaming (AsyncGenerator pattern over subprocess JSONL)
  private eventQueue = new EventQueue();

  // Error deduplication — suppress identical consecutive errors after a threshold
  // to prevent a broken subprocess from flooding the user's session.
  private lastSubprocessError: string | null = null;
  private subprocessErrorRepeatCount = 0;
  private static readonly MAX_IDENTICAL_SUBPROCESS_ERRORS = 3;

  private resetSubprocessErrorDedup(): void {
    this.lastSubprocessError = null;
    this.subprocessErrorRepeatCount = 0;
  }

  // Ring buffer of recent subprocess stderr. Always on (independent of MKAGENT_DEBUG)
  // so that connection-test and other failures can surface what the subprocess
  // actually said, instead of a bare "timed out" with no context.
  private stderrBuffer: string[] = [];
  private stderrBufferBytes = 0;
  private static readonly STDERR_BUFFER_MAX_BYTES = 8 * 1024;

  private recordStderr(chunk: string): void {
    if (!chunk) return;
    // If a single chunk is larger than the cap, keep only its tail so the
    // buffer always holds the most-recent output even in pathological cases.
    const effective = chunk.length > PiAgent.STDERR_BUFFER_MAX_BYTES
      ? chunk.slice(chunk.length - PiAgent.STDERR_BUFFER_MAX_BYTES)
      : chunk;
    this.stderrBuffer.push(effective);
    this.stderrBufferBytes += effective.length;
    // Drop oldest chunks until we're back under the cap, but always keep at
    // least one entry so a single-chunk tail survives.
    while (this.stderrBufferBytes > PiAgent.STDERR_BUFFER_MAX_BYTES && this.stderrBuffer.length > 1) {
      const dropped = this.stderrBuffer.shift()!;
      this.stderrBufferBytes -= dropped.length;
    }
  }

  /** Returns the most recent subprocess stderr output (up to ~8KB). Empty string if nothing captured. */
  getRecentStderr(): string {
    return this.stderrBuffer.join('');
  }

  // Pending permission requests (used by handlePreToolUseRequest for ask-mode prompting)
  private pendingPermissions: Map<string, {
    resolve: (allowed: boolean) => void;
    toolName: string;
  }> = new Map();

  // Pending tool executions (correlation map for subprocess tool_execute_request -> main process -> tool_execute_response)
  private pendingToolExecutions: Map<string, {
    resolve: (result: { content: string; isError: boolean }) => void;
    reject: (error: Error) => void;
  }> = new Map();

  // Pending mini completions (correlation map for subprocess mini_completion_result)
  private pendingMiniCompletions: Map<string, {
    resolve: (text: string | null) => void;
    reject: (error: Error) => void;
  }> = new Map();

  // Pending llm_query calls (correlation map for subprocess llm_query_result).
  // Separate from pendingMiniCompletions because the payload shape differs:
  // queryLlm returns a full LLMQueryResult, not just text.
  private pendingLlmQueries: Map<string, {
    resolve: (result: LLMQueryResult) => void;
    reject: (error: Error) => void;
  }> = new Map();

  // Pending ensure_session_ready requests (branch preflight handshake)
  private pendingEnsureSessionReady: Map<string, {
    resolve: (sessionId: string | null) => void;
    reject: (error: Error) => void;
  }> = new Map();

  // Pending compact requests (manual compaction RPC)
  private pendingCompactions: Map<string, {
    resolve: (result: { summary: string; firstKeptEntryId: string; tokensBefore: number } | null) => void;
    reject: (error: Error) => void;
  }> = new Map();

  // Pending auto-compaction toggle requests
  private pendingAutoCompactionToggles: Map<string, {
    resolve: (enabled: boolean) => void;
    reject: (error: Error) => void;
  }> = new Map();

  // Pending runtime config updates (custom endpoint model capability refresh)
  private pendingRuntimeConfigUpdates: Map<string, {
    resolve: (updated: boolean) => void;
    reject: (error: Error) => void;
  }> = new Map();

  // Metadata captured before PreToolUse stripping, keyed by toolCallId.
  // This provides a deterministic bridge when side-channel metadata store misses.
  private preToolMetadataByCallId: Map<string, {
    intent?: string;
    displayName?: string;
    capturedAt: number;
  }> = new Map();

  // Current user message (for context in summarization)
  private currentUserMessage: string = '';

  // Cached session tool context (lazy-created on first session tool call)
  private _sessionToolContext: SessionToolContext | null = null;
  private backgroundEventSink: ((event: AgentEvent) => void) | null = null;

  // RPC request counter for unique IDs
  private rpcIdCounter: number = 0;

  // ============================================================
  // Constructor
  // ============================================================

  constructor(config: BackendConfig) {
    const resolvedModel = config.model || '';
    const modelDef = getModelById(resolvedModel);
    super(config, resolvedModel);

    this._supportsBranching = true;

    this.piSessionId = config.session?.sdkSessionId || null;
    this.adapter = new PiEventAdapter();
    if (modelDef?.contextWindow) {
      this.adapter.setContextWindow(modelDef.contextWindow);
    }
    if (config.miniModel) {
      this.adapter.setMiniModel(config.miniModel);
    }

    // Set session dir on adapter for concurrent-safe toolMetadataStore lookups
    if (config.session?.id && config.workspace.rootPath) {
      this.adapter.setSessionDir(join(config.workspace.rootPath, 'sessions', config.session.id));
    }

    // Wire the adapter's async overflow fallback into the event queue. The
    // fallback fires when the SDK doesn't emit a compaction_start after a
    // held overflow agent_end (e.g. _overflowRecoveryAttempted was already
    // true). It runs outside adaptEvent() so it can't yield through the
    // generator — instead, it calls these callbacks to enqueue the buffered
    // error and terminate the iterator.
    this.adapter.setOverflowFallbackHandlers(
      (event) => this.eventQueue.enqueue(event),
      () => this.eventQueue.complete(),
    );

    if (!config.isHeadless) {
      this.startConfigWatcher();
    }
  }

  /**
   * Guardrail: ensure every backend-mode session tool from core is implemented here.
   * This fails fast in development/CI instead of surfacing as runtime "Unknown session tool".
   */
  private assertBackendSessionToolParity(): void {
    const missing = [...SESSION_BACKEND_TOOL_NAMES].filter(
      (name) => !PI_BACKEND_SESSION_TOOL_NAMES.has(name),
    );

    if (missing.length > 0) {
      throw new Error(
        `PiAgent missing backend session tool implementations: ${missing.join(', ')}`,
      );
    }
  }

  // ============================================================
  // Subprocess Management
  // ============================================================

  /**
   * Ensure the subprocess is spawned and ready.
   * Lazy initialization -- spawns on first use.
   */
  private async ensureSubprocess(): Promise<void> {
    if (this.subprocess && this.subprocessReady) {
      await this.subprocessReady;
      return;
    }

    await this.spawnSubprocess();
  }

  /**
   * Spawn the pi-agent-server subprocess and set up JSONL communication.
   */
  private async spawnSubprocess(): Promise<void> {
    const runtime = getBackendRuntime(this.config);
    const piServerPath = runtime.paths?.piServer;
    if (!piServerPath) {
      throw new Error('piServerPath not configured. Cannot spawn Pi subprocess.');
    }

    const nodePath = runtime.paths?.node || process.execPath;
    const cwd = this.resolvedCwd();

    this.debug(`Spawning Pi subprocess: ${nodePath} ${piServerPath}`);
    this.resetSubprocessErrorDedup();

    // Set up ready promise before spawning
    this.subprocessReady = new Promise<void>((resolve) => {
      this.subprocessReadyResolve = resolve;
    });

    // Build session ID and session dir path upfront (used for spawn env + init command)
    const sessionId = this.config.session?.id || `agent-${Date.now()}`;
    const sessionDir = this.config.session
      ? join(this.config.workspace.rootPath, 'sessions', sessionId)
      : undefined;

    // Build spawn args — optionally preload the network interceptor
    // for tool metadata injection/capture across all API formats.
    const args = [piServerPath];
    const interceptorPath = runtime.paths?.interceptor;
    if (interceptorPath) {
      args.unshift('--require', interceptorPath);
    }

    // Resolve credentials before spawning so we can derive AWS env vars
    // from the same fetch that produces piAuth (single source of truth).

    // Retrieve auth credentials for the subprocess.
    // Custom endpoint mode must NOT fall back to global API keys — keyless local endpoints
    // are valid, and non-local endpoints should fail explicitly instead of using unrelated creds.
    const piAuth = await this.getPiAuth();
    const isCustomEndpointMode = !!runtime.customEndpoint;
    const legacyApiKey = (!piAuth && !isCustomEndpointMode) ? await this.getApiKey() : undefined;
    if (isCustomEndpointMode && !piAuth) {
      this.debug('Custom endpoint mode: no provider credential configured, sending empty API key');
    }

    // Spawn the subprocess
    const child = spawn(nodePath, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...getProxyEnvVars(),
        ...this.config.envOverrides,
        // Pass session dir for cross-process toolMetadataStore
        ...(sessionDir ? { MKAGENT_SESSION_DIR: sessionDir } : {}),
        // Propagate debug mode
        MKAGENT_DEBUG: (process.argv.includes('--debug') || process.env.MKAGENT_DEBUG === '1') ? '1' : '0',
      },
    });

    this.subprocess = child;

    // Set up readline for JSONL parsing from stdout
    this.readline = createInterface({
      input: child.stdout!,
      crlfDelay: Infinity,
    });

    this.readline.on('line', (line: string) => {
      this.handleLine(line);
    });

    // Always capture stderr into a bounded ring buffer so callers (e.g. the
    // connection-test timeout path in factory.ts) can surface it on failure.
    // Keep the MKAGENT_DEBUG-gated log for interactive dev work.
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.recordStderr(text);
      const trimmed = text.trim();
      if (trimmed) {
        this.debug(`[subprocess stderr] ${trimmed}`);
      }
    });

    // Handle subprocess exit
    child.on('exit', (code, signal) => {
      this.handleSubprocessExit(code, signal);
    });

    child.on('error', (error) => {
      this.debug(`Subprocess error: ${error.message}`);
      this.resetSubprocessErrorDedup();
      this.eventQueue.enqueue({ type: 'error', message: `Pi subprocess error: ${error.message}` });
      this.eventQueue.complete();
    });

    const sessionPath = this.config.session
      ? getSessionPath(this.config.workspace.rootPath, sessionId)
      : '';
    const plansFolderPath = getSessionPlansPath(this.config.workspace.rootPath, sessionId);
    const workingDirectory = this.config.session?.workingDirectory || cwd;

    // Send init command (flat structure matching subprocess InboundMessage type)
    this.send({
      type: 'init',
      apiKey: legacyApiKey || '',
      model: this._model,
      cwd,
      thinkingLevel: this._thinkingLevel,
      workspaceRootPath: this.config.workspace.rootPath,
      sessionId,
      sessionPath,
      workingDirectory,
      plansFolderPath,
      miniModel: this.config.miniModel,
      providerType: this.config.providerType,
      authType: this.config.authType,
      workspaceId: this.config.workspace.id,
      piAuth,
      baseUrl: runtime.baseUrl,
      customEndpoint: runtime.customEndpoint,
      customModels: runtime.customModels,
      // Branch params for Pi SDK session fork
      branchFromSdkSessionId: this.config.session?.branchFromSdkSessionId,
      branchFromSessionPath: this.config.session?.branchFromSessionPath,
      branchFromSdkTurnId: this.config.session?.branchFromSdkTurnId,
    });

    // Wait for subprocess to report ready
    await this.subprocessReady;
    this.debug('Pi subprocess is ready');

    // Ensure auto-compaction is explicitly enabled for embedded sessions.
    // PI defaults this to enabled, but we set it proactively for clarity and resilience.
    try {
      const enabled = await this.requestSetAutoCompaction(true);
      this.debug(`PI auto-compaction enabled: ${enabled}`);
    } catch (error) {
      this.debug(`Failed to configure PI auto-compaction (continuing): ${error instanceof Error ? error.message : String(error)}`);
    }

    // Register session-scoped tools as proxy tools in the subprocess.
    // These tools (SubmitPlan, config_validate, call_llm, etc.)
    // are executed in the main process when the LLM calls them.
    this.assertBackendSessionToolParity();
    let sessionToolDefs = getSessionToolProxyDefs();

    // Mirror Claude's gate: hide `browser_tool` when the user has disabled
    // the built-in browser tool. Without this filter, Pi would still advertise
    // `mcp__session__browser_tool` while Claude doesn't — sessions would behave
    // inconsistently depending on backend.
    if (!getBrowserToolEnabled()) {
      sessionToolDefs = sessionToolDefs.filter(d => d.name !== 'mcp__session__browser_tool');
    }

    // Patch call_llm description with provider-specific model hint
    if (this.config.miniModel) {
      const callLlmDef = sessionToolDefs.find(d => d.name === 'mcp__session__call_llm');
      if (callLlmDef) {
        callLlmDef.description += `\n\nDefault fast model for this session: ${this.config.miniModel}. Omit the model parameter to use it automatically.`;
      }
    }

    this.send({
      type: 'register_tools',
      tools: sessionToolDefs,
    });
    this.debug(`Registered ${sessionToolDefs.length} session tools with subprocess`);

  }

  /** Build Pi's provider-aware API-key credential. */
  private async getPiAuth(): Promise<{
    provider: string;
    credential: { type: 'api_key'; key: string };
  } | null> {
    const piAuthProvider = getBackendRuntime(this.config).piAuthProvider;
    if (!piAuthProvider) return null;

    try {
      const credentialManager = getCredentialManager();
      const slug = this.config.connectionSlug || 'pi';

      const apiKey = await credentialManager.getLlmApiKey(slug);
      if (apiKey) {
        return { provider: piAuthProvider, credential: { type: 'api_key', key: apiKey } };
      }

      this.debug(`No credentials found for Pi provider: ${piAuthProvider}`);
      return null;
    } catch (error) {
      this.debug(`Failed to retrieve Pi auth: ${error}`);
      return null;
    }
  }

  /**
   * Retrieve API key from the credential manager for subprocess injection.
   * Legacy fallback when piAuthProvider is not set.
   * The subprocess expects a single API key string (passed via init.apiKey).
   */
  private async getApiKey(): Promise<string | null> {
    try {
      const credentialManager = getCredentialManager();
      const slug = this.config.connectionSlug || 'pi';

      const apiKey = await credentialManager.getLlmApiKey(slug);
      if (apiKey) {
        return apiKey;
      }

      this.debug('No API keys found for Pi agent');
      return null;
    } catch (error) {
      this.debug(`Failed to retrieve API key: ${error}`);
      return null;
    }
  }

  /**
   * Send a JSONL command to the subprocess stdin.
   */
  private send(cmd: Record<string, unknown>): void {
    if (!this.subprocess?.stdin?.writable) {
      this.debug('Cannot send to subprocess: stdin not writable');
      return;
    }
    const line = JSON.stringify(cmd);
    this.subprocess.stdin.write(line + '\n');
  }

  /**
   * Parse a JSONL line from subprocess stdout and dispatch by type.
   */
  private handleLine(line: string): void {
    if (!line.trim()) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      this.debug(`Invalid JSONL from subprocess: ${line.slice(0, 200)}`);
      return;
    }

    const type = msg.type as string;

    if (type !== 'error') {
      this.resetSubprocessErrorDedup();
    }

    switch (type) {
      case 'ready':
        // Subprocess initialized, callback server listening
        this.callbackPort = (msg.callbackPort as number) || 0;
        if (msg.sessionId) {
          this.piSessionId = msg.sessionId as string;
          this.config.onSdkSessionIdUpdate?.(this.piSessionId!);
        }
        this.subprocessReadyResolve?.();
        break;

      case 'event':
        // Pi SDK event -- forward through PiEventAdapter
        this.handleSubprocessEvent(msg.event as Record<string, unknown>);
        break;

      case 'pre_tool_use_request':
        // Subprocess needs permission check + transforms before tool execution
        this.handlePreToolUseRequest(msg as {
          requestId: string;
          toolName: string;
          toolCallId?: string;
          input: Record<string, unknown>;
        });
        break;

      case 'tool_execute_request':
        // Subprocess wants main process to execute a proxy tool (MCP/API/session)
        this.handleToolExecuteRequest(msg as {
          requestId: string;
          toolName: string;
          args: Record<string, unknown>;
        });
        break;

      case 'session_tool_completed':
        // Session MCP tool completed -- fire callbacks (SubmitPlan, auth, etc.)
        this.handleSessionToolCompleted(msg);
        break;

      case 'mini_completion_result':
        // Response to a mini_completion request
        this.handleMiniCompletionResult(msg);
        break;

      case 'llm_query_result': {
        // Response to an llm_query request
        const id = msg.id as string;
        const pending = this.pendingLlmQueries.get(id);
        if (pending) {
          this.pendingLlmQueries.delete(id);
          const result = msg.result as LLMQueryResult | null;
          if (result) {
            pending.resolve(result);
          } else {
            const errorMessage = typeof msg.errorMessage === 'string' ? msg.errorMessage : 'llm_query failed';
            pending.reject(new Error(errorMessage));
          }
        }
        break;
      }

      case 'ensure_session_ready_result':
        // Response to an ensure_session_ready request
        this.handleEnsureSessionReadyResult(msg);
        break;

      case 'compact_result':
        // Response to a compact request
        this.handleCompactResult(msg);
        break;

      case 'set_auto_compaction_result':
        // Response to an auto-compaction toggle request
        this.handleSetAutoCompactionResult(msg);
        break;

      case 'update_runtime_config_result':
        // Response to a runtime config refresh request
        this.handleRuntimeConfigUpdateResult(msg);
        break;

      case 'session_id_update':
        // Pi session ID changed
        if (msg.sessionId) {
          this.piSessionId = msg.sessionId as string;
          this.config.onSdkSessionIdUpdate?.(this.piSessionId!);
        }
        break;

      case 'error': {
        const errorCode = typeof msg.code === 'string' ? msg.code : undefined;
        const rawMessage = String(msg.message || 'Unknown subprocess error');

        this.debug(`Subprocess error${errorCode ? ` (${errorCode})` : ''}: ${rawMessage}`);
        // Reject any pending mini completions so errors propagate immediately.
        // mini_completion_error is an internal utility-path failure (title/summarization)
        // and should not surface as a user-visible chat error.
        for (const [id, pending] of this.pendingMiniCompletions) {
          pending.reject(new Error(rawMessage));
          this.pendingMiniCompletions.delete(id);
        }

        // Same treatment for pending llm_query calls. llm_query_error is also an
        // internal utility-path code (call_llm): the dual-emit from the subprocess
        // means a targeted `llm_query_result` is sent alongside this generic `error`
        // to reject the specific pending promise — this loop is the defensive cleanup
        // for queries that never got a targeted result (subprocess crash, etc.).
        for (const [id, pending] of this.pendingLlmQueries) {
          pending.reject(new Error(rawMessage));
          this.pendingLlmQueries.delete(id);
        }

        if (errorCode === 'mini_completion_error' || errorCode === 'llm_query_error') {
          this.debug(`Ignoring ${errorCode} subprocess error in chat stream`);
          break;
        }

        // Reject pending ensure_session_ready requests (used by branch preflight)
        for (const [id, pending] of this.pendingEnsureSessionReady) {
          pending.reject(new Error(rawMessage));
          this.pendingEnsureSessionReady.delete(id);
        }

        // Reject pending compact/toggle requests
        for (const [id, pending] of this.pendingCompactions) {
          pending.reject(new Error(rawMessage));
          this.pendingCompactions.delete(id);
        }
        for (const [id, pending] of this.pendingAutoCompactionToggles) {
          pending.reject(new Error(rawMessage));
          this.pendingAutoCompactionToggles.delete(id);
        }
        for (const [id, pending] of this.pendingRuntimeConfigUpdates) {
          pending.reject(new Error(rawMessage));
          this.pendingRuntimeConfigUpdates.delete(id);
        }

        // Suppress repeated identical errors to prevent a broken subprocess
        // from flooding the user's session (e.g. EFAULT loop).
        if (rawMessage === this.lastSubprocessError) {
          this.subprocessErrorRepeatCount++;
          if (this.subprocessErrorRepeatCount > PiAgent.MAX_IDENTICAL_SUBPROCESS_ERRORS) {
            this.debug(`Suppressing repeated subprocess error (${this.subprocessErrorRepeatCount}x): ${rawMessage}`);
            break;
          }
        } else {
          this.lastSubprocessError = rawMessage;
          this.subprocessErrorRepeatCount = 1;
        }

        const parsed = parseError(new Error(rawMessage));
        if (parsed.code !== 'unknown_error') {
          this.eventQueue.enqueue({ type: 'typed_error', error: parsed });
        } else {
          this.eventQueue.enqueue({
            type: 'error',
            message: `Pi subprocess error: ${rawMessage}`,
          });
        }

        // Note: The subprocess should follow this with a synthetic agent_end event
        // which will call eventQueue.complete(). If it doesn't, handleSubprocessExit()
        // will complete the queue when the process exits.
        break;
      }

      default:
        this.debug(`Unknown subprocess message type: ${type}`);
    }
  }

  /**
   * Forward a Pi SDK event from the subprocess through the event adapter.
   */
  private handleSubprocessEvent(event: Record<string, unknown>): void {
    // The subprocess sends Pi SDK AgentSessionEvent objects serialized as JSON.
    // Feed them through PiEventAdapter to convert to MkAgentEvents.

    // Detect session MCP tool completions (same pattern as in-process version)
    const eventType = event.type as string;
    let adaptedEvent = event;

    if (eventType === 'tool_execution_start') {
      const toolName = event.toolName as string;
      if (toolName?.startsWith('session__') || toolName?.startsWith('mcp__session__')) {
        // Session tool tracking is handled by the subprocess; it sends
        // session_tool_completed events when appropriate.
      }

      // Deterministic metadata bridge: if subprocess event lacks toolMetadata,
      // inject metadata captured from pre_tool_use_request before stripping.
      const toolCallId = event.toolCallId as string | undefined;
      const existingMeta = event.toolMetadata as { intent?: string; displayName?: string } | undefined;
      if (toolCallId && !existingMeta) {
        const cached = this.preToolMetadataByCallId.get(toolCallId);
        if (cached && (cached.intent || cached.displayName)) {
          adaptedEvent = {
            ...event,
            toolMetadata: {
              intent: cached.intent,
              displayName: cached.displayName,
              source: 'interceptor',
            },
          };
          this.debug(`Injected pre-tool metadata for ${toolName} (${toolCallId}) from bridge cache`);
        }
      }
    }

    if (eventType === 'tool_execution_end') {
      const toolCallId = event.toolCallId as string | undefined;
      if (toolCallId) {
        this.preToolMetadataByCallId.delete(toolCallId);
      }
    }

    // Adapt event to CraftAgentEvents
    // The event adapter expects typed PiAgentEvent/AgentSessionEvent objects,
    // but since we're receiving plain JSON, we cast through unknown.
    for (const agentEvent of this.adapter.adaptEvent(adaptedEvent as any)) {
      if (!this._isProcessing && this.backgroundEventSink && (
        agentEvent.type === 'task_backgrounded' ||
        agentEvent.type === 'task_progress' ||
        agentEvent.type === 'task_completed' ||
        agentEvent.type === 'workflow_agent_completed'
      )) {
        this.backgroundEventSink(agentEvent);
      } else {
        this.eventQueue.enqueue(agentEvent);
      }
    }

    // Turn-completion is now adapter-driven so overflow recovery can hold the
    // queue open across the SDK's compaction → agent.continue() sequence
    // (see PiEventAdapter overflow state machine). The adapter returns true
    // when the queue should terminate — either on a normal agent_end with no
    // recovery in flight, or on a compaction_end failure that drains a held
    // overflow.
    if (this.adapter.shouldCompleteQueue(eventType === 'agent_end')) {
      this.eventQueue.complete();
    }
  }

  setBackgroundEventSink(sink: ((event: AgentEvent) => void) | null): void {
    this.backgroundEventSink = sink;
  }

  /**
   * Handle a pre_tool_use_request from the subprocess.
   * Runs the centralized permission pipeline and sends the decision back.
   */
  private async handlePreToolUseRequest(req: {
    requestId: string;
    toolName: string;
    toolCallId?: string;
    input: Record<string, unknown>;
  }): Promise<void> {
    const { requestId, toolName, toolCallId, input } = req;
    const debugSessionId = this.config.session?.id || this._sessionId;
    this.debug(`PreToolUse request from subprocess: ${toolName} (${requestId}, sessionId=${debugSessionId})`);

    // Capture metadata BEFORE centralized checks strip it out.
    // This bridge is deterministic and avoids relying solely on side-channel store lookups.
    const preIntent = typeof input._intent === 'string' ? input._intent : undefined;
    const preDisplayName = typeof input._displayName === 'string' ? input._displayName : undefined;
    if (toolCallId && (preIntent || preDisplayName)) {
      this.preToolMetadataByCallId.set(toolCallId, {
        intent: preIntent,
        displayName: preDisplayName,
        capturedAt: Date.now(),
      });
      this.debug(`Captured pre-tool metadata for ${toolName} (${toolCallId}, sessionId=${debugSessionId}): intent=${!!preIntent}, displayName=${!!preDisplayName}`);
    }

    const rootPath = this.config.workspace.rootPath ?? this.workingDirectory;
    const workspaceSlug = extractWorkspaceSlug(rootPath, this.config.workspace.id);
    const sessionId = this.config.session?.id || this._sessionId;
    const plansFolderPath = sessionId
      ? getSessionPlansPath(rootPath, sessionId)
      : undefined;
    const dataFolderPath = sessionId
      ? getSessionDataPath(rootPath, sessionId)
      : undefined;

    // Build RTK context fresh per call so toggling the preference takes
    // effect without restart. `getRtkPath()` is cached per process.
    const rtkContext: RtkContext | undefined = getRtkEnabled()
      ? { enabled: true, path: getRtkPath(), exclude: [] }
      : undefined;

    const checkResult = runPreToolUseChecks({
      toolName,
      input,
      sessionId,
      permissionMode: this.permissionManager.getPermissionMode(),
      workspaceRootPath: rootPath,
      workspaceId: workspaceSlug,
      plansFolderPath,
      dataFolderPath,
      workingDirectory: this.config.session?.workingDirectory,
      permissionManager: this.permissionManager,
      rtkContext,
      onDebug: (msg) => this.debug(`PreToolUse(sessionId=${sessionId}): ${msg}`),
    });

    switch (checkResult.type) {
      case 'allow':
        this.send({ type: 'pre_tool_use_response', requestId, action: 'allow' });
        return;

      case 'modify':
        this.send({ type: 'pre_tool_use_response', requestId, action: 'modify', input: checkResult.input });
        return;

      case 'block': {
        const diagnostics = getPermissionModeDiagnostics(sessionId);
        this.debug(`__PERMISSION_BLOCK__${JSON.stringify({
          sessionId,
          toolName,
          effectiveMode: diagnostics.permissionMode,
          modeVersion: diagnostics.modeVersion,
          changedBy: diagnostics.lastChangedBy,
          changedAt: diagnostics.lastChangedAt,
          reason: checkResult.reason,
        })}`);
        this.send({ type: 'pre_tool_use_response', requestId, action: 'block', reason: checkResult.reason });
        return;
      }

      case 'call_llm_intercept':
      case 'spawn_session_intercept':
        // These tools are proxy tools handled via tool_execute_request — just allow
        this.send({ type: 'pre_tool_use_response', requestId, action: 'allow' });
        return;

      case 'prompt': {
        if (!this.onPermissionRequest) {
          // No permission handler — allow
          if (checkResult.modifiedInput) {
            this.send({ type: 'pre_tool_use_response', requestId, action: 'modify', input: checkResult.modifiedInput });
          } else {
            this.send({ type: 'pre_tool_use_response', requestId, action: 'allow' });
          }
          return;
        }

        const permRequestId = `pi-perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.debug(`PreToolUse(sessionId=${sessionId}): Prompting user for ${toolName} - ${checkResult.description}`);

        // Wait for user response via pendingPermissions
        const permissionPromise = new Promise<boolean>((resolve) => {
          this.pendingPermissions.set(permRequestId, {
            resolve,
            toolName,
          });
        });

        this.onPermissionRequest({
          requestId: permRequestId,
          toolName,
          command: checkResult.command,
          description: checkResult.description,
          type: checkResult.promptType,
          appName: checkResult.appName,
          reason: checkResult.reason,
          impact: checkResult.impact,
          requiresSystemPrompt: checkResult.requiresSystemPrompt,
          rememberForMinutes: checkResult.rememberForMinutes,
          commandHash: checkResult.commandHash,
          approvalTtlSeconds: checkResult.approvalTtlSeconds,
        });

        const allowed = await permissionPromise;
        this.pendingPermissions.delete(permRequestId);

        if (!allowed) {
          this.send({ type: 'pre_tool_use_response', requestId, action: 'block', reason: 'Permission denied by user.' });
          return;
        }

        if (checkResult.modifiedInput) {
          this.send({ type: 'pre_tool_use_response', requestId, action: 'modify', input: checkResult.modifiedInput });
        } else {
          this.send({ type: 'pre_tool_use_response', requestId, action: 'allow' });
        }
        return;
      }
    }
  }

  /**
   * Handle a tool_execute_request from the subprocess.
   * Routes proxy tool calls (MCP, API, session) to the appropriate handler.
   *
   * The subprocess expects responses in the format:
   *   { content: string; isError: boolean }
   */
  private async handleToolExecuteRequest(request: {
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
  }): Promise<void> {
    try {
      const result = await this.routeToolCall(request.toolName, request.args);
      this.send({
        type: 'tool_execute_response',
        requestId: request.requestId,
        result,
      });
    } catch (error) {
      this.send({
        type: 'tool_execute_response',
        requestId: request.requestId,
        result: {
          content: error instanceof Error ? error.message : String(error),
          isError: true,
        },
      });
    }
  }

  /**
   * Route a proxy tool call to the appropriate handler based on tool name.
   *
   * - Session tools (SubmitPlan, config_validate, etc.) -> session-tools-core handlers
   * - call_llm -> preExecuteCallLlm (BaseAgent)
   *
   * Returns { content: string; isError: boolean } matching subprocess protocol.
   */
  private async routeToolCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ content: string; isError: boolean }> {
    // Session-scoped tools — strip mcp__session__ prefix added by the Pi SDK
    // registration (tools are registered as mcp__session__SubmitPlan, etc.)
    const strippedName = toolName.startsWith('mcp__session__')
      ? toolName.slice('mcp__session__'.length)
      : toolName;

    if (SESSION_TOOL_NAMES.has(strippedName)) {
      return this.executeSessionTool(strippedName, args);
    }

    // Unknown tool
    return {
      content: `Unknown proxy tool: ${toolName}`,
      isError: true,
    };
  }

  /**
   * Get or create a SessionToolContext for executing session-scoped tools.
   * Cached per agent instance since the workspace/session don't change.
   */
  private getSessionToolContext(): SessionToolContext {
    if (this._sessionToolContext) return this._sessionToolContext;

    const sessionId = this.config.session?.id || '';
    const workspacePath = this.config.workspace.rootPath;
    this._sessionToolContext = createPiContext({
      sessionId,
      workspacePath,
      workingDirectory: this.config.session?.workingDirectory,
      onPlanSubmitted: (planPath: string) => {
        setLastPlanFilePath(sessionId, planPath);
        this.onPlanSubmitted?.(planPath);
      },
    });

    // Attach session self-management bindings (lazy getters from callback registry)
    attachSessionSelfManagementBindings(this._sessionToolContext, sessionId);

    return this._sessionToolContext;
  }

  /**
   * Execute a session-scoped tool by name.
   * Uses the canonical registry from @mkagent/session-tools-core.
   */
  private async executeSessionTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ content: string; isError: boolean }> {
    try {
      // call_llm uses the shared pre-execution pipeline from BaseAgent
      if (toolName === 'call_llm') {
        try {
          const result = await this.preExecuteCallLlm(args);
          return { content: result.text || '(Model returned empty response)', isError: false };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { content: `call_llm failed: ${msg}`, isError: true };
        }
      }

      // spawn_session uses the shared pre-execution pipeline from BaseAgent
      if (toolName === 'spawn_session') {
        try {
          const result = await this.preExecuteSpawnSession(args);
          return { content: JSON.stringify(result, null, 2), isError: false };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return { content: `spawn_session failed: ${msg}`, isError: true };
        }
      }

      // browser_tool — single CLI-like tool for all browser actions
      if (toolName === 'browser_tool') {
        const callbacks = getSessionScopedToolCallbacks(this._sessionId);
        const browserFns = callbacks?.browserPaneFns;
        if (!browserFns) {
          return { content: 'Browser window controls are not available. This tool requires the desktop app.', isError: true };
        }

        try {
          const result = await executeBrowserToolCommand({
            command: (args.command as string | string[]) ?? '',
            fns: browserFns,
            sessionId: this._sessionId,
          });

          let content = result.output;
          if (result.image) {
            const sessionPath = getSessionPath(this.config.workspace.rootPath, this._sessionId);
            const imageBuffer = Buffer.from(result.image.data, 'base64');
            const ext = result.image.mimeType === 'image/jpeg' ? 'jpg' : 'png';
            const saved = saveBinaryResponse(sessionPath, `browser-screenshot.${ext}`, imageBuffer, result.image.mimeType);

            if (saved.type === 'file_download') {
              content += [
                '',
                `Saved screenshot: ${saved.path}`,
                '',
                '```image-preview',
                JSON.stringify({
                  src: saved.path,
                  title: 'Browser Screenshot',
                }, null, 2),
                '```',
              ].join('\n');
            } else {
              content += `\n\n[Screenshot captured (${Math.round(result.image.sizeBytes / 1024)}KB ${result.image.mimeType}) but failed to save: ${saved.error}]`;
            }
          }

          return { content, isError: false };
        } catch (error) {
          // Branch on `err.code` (string), not `instanceof CodedError` — the
          // transport reconstructs a plain Error on the receiving side, so
          // class identity is lost across the wire.
          const rawCode = (error as { code?: unknown } | null)?.code;
          const code = typeof rawCode === 'string' ? rawCode : '';
          const msg = error instanceof Error ? error.message : String(error);
          const friendly = mapBrowserToolErrorCode(code) ?? msg;
          return { content: friendly, isError: true };
        }
      }

      const def = SESSION_TOOL_REGISTRY.get(toolName);
      if (!def) {
        return { content: `Unknown session tool: ${toolName}`, isError: true };
      }
      if (!def.handler) {
        return {
          content: `Session tool '${toolName}' is backend-executed (${def.executionMode}) but has no PiAgent adapter implementation.`,
          isError: true,
        };
      }

      const ctx = this.getSessionToolContext();
      const result: SessionToolResult = await def.handler(ctx, args);

      // Convert ToolResult to subprocess response format
      const text = result.content.map(c => c.text).join('\n');
      return { content: text, isError: !!result.isError };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.debug(`Session tool ${toolName} failed: ${msg}`);
      return { content: `Session tool error: ${msg}`, isError: true };
    }
  }



  /**
   * Handle session_tool_completed from subprocess.
   *
   * NOTE: For proxy-executed session tools, callbacks (onPlanSubmitted, etc.)
   * are already fired by executeSessionTool() via the SessionToolContext.
   * The subprocess sends this event because handleSessionEvent() detects the
   * mcp__session__ prefix, but we intentionally skip handleSessionMcpToolCompletion()
   * here to avoid double-firing callbacks.
   */
  private handleSessionToolCompleted(msg: Record<string, unknown>): void {
    const toolName = msg.toolName as string;
    const isError = msg.isError as boolean;
    this.debug(`Session tool completed: ${toolName} (isError=${isError})`);
    // Callbacks already handled by executeSessionTool() — no-op.
  }

  /**
   * Handle mini_completion_result from subprocess.
   */
  private handleMiniCompletionResult(msg: Record<string, unknown>): void {
    const id = msg.id as string;
    const text = msg.text as string | null;
    const pending = this.pendingMiniCompletions.get(id);
    if (pending) {
      this.pendingMiniCompletions.delete(id);
      pending.resolve(text);
    }
  }

  /**
   * Handle ensure_session_ready_result from subprocess.
   */
  private handleEnsureSessionReadyResult(msg: Record<string, unknown>): void {
    const id = msg.id as string;
    const sessionId = (msg.sessionId as string | null) ?? null;
    const pending = this.pendingEnsureSessionReady.get(id);
    if (!pending) return;

    this.pendingEnsureSessionReady.delete(id);
    if (sessionId && this.piSessionId !== sessionId) {
      this.piSessionId = sessionId;
      this.config.onSdkSessionIdUpdate?.(sessionId);
    }
    pending.resolve(sessionId);
  }

  /**
   * Handle compact_result from subprocess.
   */
  private handleCompactResult(msg: Record<string, unknown>): void {
    const id = msg.id as string;
    const success = Boolean(msg.success);
    const pending = this.pendingCompactions.get(id);
    if (!pending) return;

    this.pendingCompactions.delete(id);
    if (!success) {
      pending.reject(new Error(String(msg.errorMessage || 'Compaction failed')));
      return;
    }

    const raw = msg.result as Record<string, unknown> | undefined;
    if (!raw) {
      pending.resolve(null);
      return;
    }

    pending.resolve({
      summary: String(raw.summary || ''),
      firstKeptEntryId: String(raw.firstKeptEntryId || ''),
      tokensBefore: Number(raw.tokensBefore || 0),
    });
  }

  /**
   * Handle set_auto_compaction_result from subprocess.
   */
  private handleSetAutoCompactionResult(msg: Record<string, unknown>): void {
    const id = msg.id as string;
    const success = Boolean(msg.success);
    const pending = this.pendingAutoCompactionToggles.get(id);
    if (!pending) return;

    this.pendingAutoCompactionToggles.delete(id);
    if (!success) {
      pending.reject(new Error(String(msg.errorMessage || 'Failed to set auto-compaction')));
      return;
    }

    pending.resolve(Boolean(msg.enabled));
  }

  /**
   * Handle update_runtime_config_result from subprocess.
   */
  private handleRuntimeConfigUpdateResult(msg: Record<string, unknown>): void {
    const id = msg.id as string;
    const success = Boolean(msg.success);
    const pending = this.pendingRuntimeConfigUpdates.get(id);
    if (!pending) return;

    this.pendingRuntimeConfigUpdates.delete(id);
    if (!success) {
      pending.reject(new Error(String(msg.errorMessage || 'Runtime config update failed')));
      return;
    }

    pending.resolve(Boolean(msg.updated ?? true));
  }

  /**
   * Handle subprocess exit.
   */
  private handleSubprocessExit(code: number | null, signal: string | null): void {
    this.debug(`Pi subprocess exited: code=${code}, signal=${signal}`);

    this.subprocess = null;
    this.readline = null;
    this.resetSubprocessErrorDedup();
    this.subprocessReady = null;
    this.subprocessReadyResolve = null;

    // If we were processing, emit error + complete
    if (this._isProcessing) {
      const exitReason = signal ? `signal ${signal}` : `code ${code}`;
      this.eventQueue.enqueue({
        type: 'error',
        message: `Pi subprocess exited unexpectedly (${exitReason})`,
      });
      this.eventQueue.complete();
    }

    // Reject pending mini completions with error (not null) so callers
    // get a meaningful error instead of silently returning "no response"
    const exitReason = signal ? `signal ${signal}` : `code ${code}`;
    for (const [, pending] of this.pendingMiniCompletions) {
      pending.reject(new Error(`Pi subprocess exited unexpectedly (${exitReason})`));
    }
    this.pendingMiniCompletions.clear();

    // Reject pending llm_query calls (call_llm in-flight during subprocess crash)
    for (const [, pending] of this.pendingLlmQueries) {
      pending.reject(new Error(`Pi subprocess exited unexpectedly (${exitReason})`));
    }
    this.pendingLlmQueries.clear();

    // Reject pending ensure_session_ready requests
    for (const [, pending] of this.pendingEnsureSessionReady) {
      pending.reject(new Error(`Pi subprocess exited unexpectedly (${exitReason})`));
    }
    this.pendingEnsureSessionReady.clear();

    // Reject pending compact/toggle requests
    for (const [, pending] of this.pendingCompactions) {
      pending.reject(new Error(`Pi subprocess exited unexpectedly (${exitReason})`));
    }
    this.pendingCompactions.clear();

    for (const [, pending] of this.pendingAutoCompactionToggles) {
      pending.reject(new Error(`Pi subprocess exited unexpectedly (${exitReason})`));
    }
    this.pendingAutoCompactionToggles.clear();

    for (const [, pending] of this.pendingRuntimeConfigUpdates) {
      pending.reject(new Error(`Pi subprocess exited unexpectedly (${exitReason})`));
    }
    this.pendingRuntimeConfigUpdates.clear();

    // Reject all pending tool executions
    for (const [, pending] of this.pendingToolExecutions) {
      pending.reject(new Error('Pi subprocess exited'));
    }
    this.pendingToolExecutions.clear();

    // Drop any cached pre-tool metadata for the dead subprocess.
    this.preToolMetadataByCallId.clear();
  }

  /**
   * Ask subprocess to create/verify the primary session (without sending a prompt)
   * and return the active Pi session ID.
   */
  private async requestEnsureSessionReady(): Promise<string | null> {
    await this.ensureSubprocess();

    const id = `ensure-ready-${++this.rpcIdCounter}`;
    const timeoutMs = 15_000;

    return new Promise<string | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingEnsureSessionReady.delete(id);
        reject(new Error(`ensure_session_ready timed out after ${Math.floor(timeoutMs / 1000)}s`));
      }, timeoutMs);

      this.pendingEnsureSessionReady.set(id, {
        resolve: (sessionId) => {
          clearTimeout(timer);
          resolve(sessionId);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      this.send({ type: 'ensure_session_ready', id });
    });
  }

  /**
   * Ask subprocess to compact the active session context.
   */
  private async requestCompact(customInstructions?: string): Promise<{ summary: string; firstKeptEntryId: string; tokensBefore: number } | null> {
    await this.ensureSubprocess();

    const id = `compact-${++this.rpcIdCounter}`;
    // GPT-backed Pi compactions on large conversations can legitimately take 60-120s
    // (single blocking OpenAI summary call, no progress stream). 5 min covers realistic
    // cases; truly hung subprocesses are caught by the stdio death watchdog.
    const timeoutMs = 300_000;

    return new Promise<{ summary: string; firstKeptEntryId: string; tokensBefore: number } | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCompactions.delete(id);
        reject(new Error(`compact timed out after ${Math.floor(timeoutMs / 1000)}s`));
      }, timeoutMs);

      this.pendingCompactions.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      this.send({ type: 'compact', id, customInstructions });
    });
  }

  /**
   * Ask subprocess to enable/disable auto-compaction.
   */
  private async requestSetAutoCompaction(enabled: boolean): Promise<boolean> {
    await this.ensureSubprocess();

    const id = `set-auto-compaction-${++this.rpcIdCounter}`;
    const timeoutMs = 15_000;

    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAutoCompactionToggles.delete(id);
        reject(new Error(`set_auto_compaction timed out after ${Math.floor(timeoutMs / 1000)}s`));
      }, timeoutMs);

      this.pendingAutoCompactionToggles.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      this.send({ type: 'set_auto_compaction', id, enabled });
    });
  }

  /**
   * Ask subprocess to refresh runtime-affecting custom endpoint config in-place.
   */
  private async requestRuntimeConfigUpdate(update: BackendRuntimeUpdate): Promise<boolean> {
    if (!this.subprocess) return true;

    const id = `runtime-config-${++this.rpcIdCounter}`;
    const timeoutMs = 15_000;
    const runtime = update.runtime ?? {};

    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRuntimeConfigUpdates.delete(id);
        reject(new Error(`update_runtime_config timed out after ${Math.floor(timeoutMs / 1000)}s`));
      }, timeoutMs);

      this.pendingRuntimeConfigUpdates.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      this.send({
        type: 'update_runtime_config',
        id,
        model: update.model,
        providerType: update.providerType,
        authType: update.authType,
        baseUrl: runtime.baseUrl,
        customEndpoint: runtime.customEndpoint,
        customModels: runtime.customModels,
      });
    });
  }

  /**
   * Ensure branched Pi sessions are backend-ready before first user message.
   * Called by SessionManager during branch creation to avoid creating
   * transcript-only branches without real Pi session context.
   */
  override async ensureBranchReady(): Promise<void> {
    const isBranchedSession = !!this.config.session?.branchFromMessageId;
    if (!isBranchedSession) return;

    // Branched sessions must include parent session path metadata for Pi forking.
    if (!this.config.session?.branchFromSessionPath) {
      throw new Error('Pi branch preflight failed: missing branchFromSessionPath metadata');
    }

    const sessionId = await this.requestEnsureSessionReady();
    if (!sessionId) {
      throw new Error('Pi branch preflight failed: subprocess did not provide a session ID');
    }

    if (this.piSessionId !== sessionId) {
      this.piSessionId = sessionId;
      this.config.onSdkSessionIdUpdate?.(sessionId);
    }
  }

  // ============================================================
  // Chat (AsyncGenerator backed by the subprocess event queue)
  // ============================================================

  protected async *chatImpl(
    messageParam: string,
    attachments?: FileAttachment[],
    options?: ChatOptions
  ): AsyncGenerator<AgentEvent> {
    let message = messageParam;
    // Reset state for new turn
    this._isProcessing = true;
    this.abortReason = undefined;
    this.eventQueue.reset();
    this.currentUserMessage = message;
    this.adapter.startTurn();

    // Refresh session-scoped tool callbacks.
    // IMPORTANT: merge (don't replace) so SessionManager-provided browserPaneFns
    // survives across turns.
    const sessionId = this.config.session?.id;
    if (sessionId) {
      mergeSessionScopedToolCallbacks(sessionId, {
        onPlanSubmitted: (planPath) => this.onPlanSubmitted?.(planPath),
        queryFn: (request) => this.queryLlm(request),
      });
    }

    try {
      // Ensure subprocess is spawned and ready
      try {
        await this.ensureSubprocess();
      } catch (subprocessError) {
        const errorMsg = subprocessError instanceof Error ? subprocessError.message : String(subprocessError);
        this.debug(`Failed to spawn Pi subprocess: ${errorMsg}`);

        // If resume failed, clear and try fresh
        if (this.piSessionId && !options?.isRetry) {
          this.piSessionId = null;
          this.killSubprocess();
          this.clearSessionForRecovery();

          const recoveryContext = this.buildRecoveryContext();
          if (recoveryContext) {
            message = recoveryContext + message;
            this.debug('Injected recovery context into message');
          }

          await this.ensureSubprocess();
        } else {
          throw subprocessError;
        }
      }

      const trimmedMessage = message.trim();
      const compactMatch = trimmedMessage.match(/^\/compact(?:\s+([\s\S]+))?$/i);
      if (compactMatch) {
        const customInstructions = compactMatch[1]?.trim() || undefined;
        const compactResult = await this.requestCompact(customInstructions);
        if (compactResult) {
          yield {
            type: 'info',
            message: `Compacted context to fit within limits (from ~${compactResult.tokensBefore.toLocaleString()} tokens)`,
          };
        } else {
          yield { type: 'info', message: 'Compacted context to fit within limits' };
        }
        yield { type: 'complete' };
        return;
      }

      // Build system prompt
      const systemPrompt = getSystemPrompt(
        undefined, // pinnedPreferencesPrompt
        this.config.debugMode,
        this.config.workspace.rootPath,
        this.config.session?.workingDirectory,
        this.config.systemPromptPreset,
        'MkAgent Backend', // backendName
        getCoAuthorPreference(),
      );

      const promptModeDiagnostics = getPermissionModeDiagnostics(this._sessionId)
      this.debug(
        `[ModeSnapshot] sessionId=${this._sessionId} chatPrompt mode=${promptModeDiagnostics.permissionMode} ` +
        `modeVersion=${promptModeDiagnostics.modeVersion} changedBy=${promptModeDiagnostics.lastChangedBy} changedAt=${promptModeDiagnostics.lastChangedAt}`
      )

      const plansFolderPath = getSessionPlansPath(this.config.workspace.rootPath, this._sessionId);
      const stableParts = [
        `<workspace_root>${this.config.workspace.rootPath}</workspace_root>`,
        `<working_directory>${this.workingDirectory}</working_directory>`,
        `<plans_directory>${plansFolderPath}</plans_directory>`,
      ];
      const volatileParts = [
        `<session_state permission_mode="${promptModeDiagnostics.permissionMode}" />`,
      ];

      // Process attachments
      const attachmentParts: string[] = [];
      const images: Array<{ type: string; data: string; mimeType: string }> = [];
      for (const att of attachments || []) {
        if (att.mimeType?.startsWith('image/') && att.base64) {
          images.push({
            type: 'image',
            data: att.base64,
            mimeType: att.mimeType,
          });
        } else if (att.mimeType?.startsWith('image/') && (att.storedPath || att.path)) {
          attachmentParts.push(`[Attached image: ${att.name}]\n[Stored at: ${att.storedPath || att.path}]`);
        } else if (att.mimeType === 'application/pdf' && att.storedPath) {
          attachmentParts.push(`[Attached PDF: ${att.name}]\n[Stored at: ${att.storedPath}]`);
        } else if (att.storedPath) {
          let pathInfo = `[Attached file: ${att.name}]\n[Stored at: ${att.storedPath}]`;
          if (att.markdownPath) {
            pathInfo += `\n[Markdown version: ${att.markdownPath}]`;
          }
          attachmentParts.push(pathInfo);
        }
      }

      // System prompt carries only stable context (issue #862): the system block
      // is pi-ai's cache prefix before all history, so anything volatile here
      // re-stamps the prefix every turn and drops cacheRead to 0. Volatile blocks
      // ride the user-message tail instead — exactly as the Claude path already
      // does (buildTextPrompt / buildSDKUserMessage append context to the tail).
      const fullSystemPrompt = [
        systemPrompt,
        ...stableParts,
      ].filter(Boolean).join('\n\n');

      // User message: volatile context + attachments + the actual message
      // (skill read directive is already prepended to message by BaseAgent.chat())
      const userParts = [
        ...volatileParts,
        ...attachmentParts,
        message,
      ].filter(Boolean);
      const userMessage = userParts.join('\n\n');

      // Send prompt to subprocess
      const turnId = `turn-${++this.rpcIdCounter}`;
      this.send({
        type: 'prompt',
        id: turnId,
        message: userMessage,
        systemPrompt: fullSystemPrompt,
        images: images.length > 0 ? images : undefined,
      });

      for await (const event of this.eventQueue.drain()) {
        yield event;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('abort')) {
        if (this.abortReason === AbortReason.PlanSubmitted) {
          return;
        }
        if (this.abortReason === AbortReason.AuthRequest) {
          return;
        }
        return;
      }

      const errorObj = error instanceof Error ? error : new Error(String(error));
      const typedError = this.parsePiError(errorObj);

      if (typedError.code !== 'unknown_error') {
        yield { type: 'typed_error', error: typedError };
      } else {
        yield { type: 'error', message: errorObj.message };
      }

      yield { type: 'complete' };
    } finally {
      this._isProcessing = false;
    }
  }

  // ============================================================
  // Permission Handling
  // ============================================================

  /**
   * Respond to a pending permission request.
   * Permission checking now happens in the main process, so this resolves locally.
   */
  respondToPermission(requestId: string, allowed: boolean, _alwaysAllow?: boolean): void {
    const pending = this.pendingPermissions.get(requestId);
    if (pending) {
      this.pendingPermissions.delete(requestId);
      pending.resolve(allowed);
    }
  }

  // ============================================================
  // Model Forwarding
  // ============================================================

  async updateRuntimeConfig(update: BackendRuntimeUpdate): Promise<boolean> {
    const previousModel = this.getModel();
    const previousRuntime = getBackendRuntime(this.config);

    this.config = {
      ...this.config,
      providerType: update.providerType ?? this.config.providerType,
      authType: update.authType ?? this.config.authType,
      model: update.model,
      runtime: {
        ...previousRuntime,
        ...(update.runtime ?? {}),
      },
    };
    this._model = update.model;

    if (!this.subprocess) {
      this.debug(`Runtime config updated locally (no subprocess): ${previousModel} → ${update.model}`);
      return true;
    }

    const updated = await this.requestRuntimeConfigUpdate({
      ...update,
      providerType: this.config.providerType,
      authType: this.config.authType,
      runtime: getBackendRuntime(this.config),
    });
    this.debug(`Runtime config refreshed in subprocess: ${previousModel} → ${update.model}`);
    return updated;
  }

  override setModel(model: string): void {
    const previousModel = this.getModel();
    super.setModel(model);
    // Forward to subprocess so it uses the new model on next turn
    if (this.subprocess) {
      this.debug(`Forwarding model change to subprocess: ${previousModel} → ${model}`);
      this.send({ type: 'set_model', model });
    } else {
      this.debug(`Model updated but no subprocess to forward to: ${previousModel} → ${model}`);
    }
  }

  override setThinkingLevel(level: ThinkingLevel): void {
    const previousLevel = this.getThinkingLevel();
    super.setThinkingLevel(level);
    // Forward to subprocess so it uses the new thinking level on next turn
    if (this.subprocess) {
      this.debug(`Forwarding thinking level change to subprocess: ${previousLevel} → ${level}`);
      this.send({ type: 'set_thinking_level', level });
    } else {
      this.debug(`Thinking level updated but no subprocess to forward to: ${previousLevel} → ${level}`);
    }
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  isProcessing(): boolean {
    return this._isProcessing;
  }

  async abort(reason?: string): Promise<void> {
    // Deny all pending permissions
    for (const [, pending] of this.pendingPermissions) {
      pending.resolve(false);
    }
    this.pendingPermissions.clear();

    // Send abort to subprocess
    this.send({ type: 'abort' });
    this.eventQueue.complete();

    // Clear bridge cache for this interrupted turn.
    this.preToolMetadataByCallId.clear();
  }

  forceAbort(reason: AbortReason): void {
    this.abortReason = reason;
    this._isProcessing = false;

    // Reject all pending permissions
    for (const [, pending] of this.pendingPermissions) {
      pending.resolve(false);
    }
    this.pendingPermissions.clear();

    // Reject all pending tool executions
    for (const [, pending] of this.pendingToolExecutions) {
      pending.reject(new Error(`Force aborted: ${reason}`));
    }
    this.pendingToolExecutions.clear();

    // Signal turn complete to wake up any waiting consumers
    this.eventQueue.complete();

    // Clear bridge cache for aborted turn.
    this.preToolMetadataByCallId.clear();

    if (reason === AbortReason.PlanSubmitted) {
      return;
    }

    // For other reasons, send abort to subprocess
    this.send({ type: 'abort' });
  }

  /**
   * Redirect mid-stream via Pi SDK's steer().
   * Delivers the message after the current tool finishes, skips remaining
   * queued tools, and continues with full context intact.
   * Events flow through the existing generator — no abort needed.
   */
  override redirect(message: string): boolean {
    if (!this._isProcessing || !this.subprocess) {
      // Not streaming or no subprocess — fall back to abort
      this.forceAbort(AbortReason.Redirect);
      return false;
    }
    this.debug(`Steering mid-stream: "${message.slice(0, 100)}"`);
    this.send({ type: 'steer', message });
    return true;
  }

  // ============================================================
  // Session ID overrides — Pi maintains its own subprocess session id
  // ============================================================

  override getSessionId(): string | null {
    return this.piSessionId;
  }

  override setSessionId(sessionId: string | null): void {
    this.piSessionId = sessionId;
  }

  override setWorkspace(workspace: Workspace): void {
    super.setWorkspace(workspace);
    this.piSessionId = null;
    this._sessionToolContext = null;
    this.killSubprocess();
  }

  override clearHistory(): void {
    this.piSessionId = null;
    this.killSubprocess();
    super.clearHistory();
    this.debug('History cleared - next chat will start new subprocess');
  }

  destroy(): void {
    this.stopConfigWatcher();

    // Unregister session-scoped tool callbacks
    if (this.config.session?.id) {
      unregisterSessionScopedToolCallbacks(this.config.session.id);
    }

    this._sessionToolContext = null;
    // Pool clients are owned by the main process — don't close them here.
    this.killSubprocess();
    this.debug('PiAgent destroyed');
  }

  async disposeForRestart(): Promise<void> {
    this.stopConfigWatcher();

    if (this.config.session?.id) {
      unregisterSessionScopedToolCallbacks(this.config.session.id);
    }

    this._sessionToolContext = null;
    await this.killSubprocessGracefully();
    this.debug('PiAgent disposed for restart');
  }

  /**
   * Reconnect by killing subprocess -- next chat() will spawn fresh.
   */
  async reconnect(): Promise<void> {
    this.killSubprocess();
    this.debug('PiAgent reconnected (subprocess will be respawned on next chat)');
  }

  /**
   * Gracefully stop the subprocess and wait briefly for the child to exit.
   * Used before an idle runtime restart so we don't leave transient children behind.
   */
  private async killSubprocessGracefully(timeoutMs = 2_000): Promise<void> {
    const child = this.subprocess;
    if (!child) {
      this.killSubprocess();
      return;
    }

    const pid = child.pid;
    const waitForExit = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      if (child.exitCode !== null || child.signalCode) {
        resolve({ code: child.exitCode, signal: child.signalCode });
        return;
      }
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });

    try {
      this.send({ type: 'shutdown' });
    } catch {
      // stdin may already be closed
    }

    child.kill('SIGTERM');
    let result = await Promise.race([
      waitForExit,
      new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (!result && this.subprocess === child) {
      this.debug(`Pi subprocess ${pid ?? '(unknown pid)'} did not exit after ${timeoutMs}ms; sending SIGKILL`);
      child.kill('SIGKILL');
      result = await Promise.race([
        waitForExit,
        new Promise<null>(resolve => setTimeout(() => resolve(null), 1_000)),
      ]);
    }

    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }
    if (this.subprocess === child) {
      this.subprocess = null;
    }
    this.subprocessReady = null;
    this.subprocessReadyResolve = null;
    this.callbackPort = 0;
    this.preToolMetadataByCallId.clear();
    this.adapter.resetOverflowState();

    if (result) {
      this.debug(`Pi subprocess ${pid ?? '(unknown pid)'} stopped for restart: code=${result.code}, signal=${result.signal}`);
    } else {
      this.debug(`Pi subprocess ${pid ?? '(unknown pid)'} stop timed out after SIGKILL`);
    }
  }

  /**
   * Kill the subprocess and clean up resources.
   */
  private killSubprocess(): void {
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }

    if (this.subprocess) {
      // Try graceful shutdown first
      try {
        this.send({ type: 'shutdown' });
      } catch {
        // stdin may already be closed
      }
      this.subprocess.kill('SIGTERM');
      this.subprocess = null;
    }

    this.subprocessReady = null;
    this.subprocessReadyResolve = null;
    this.callbackPort = 0;
    this.preToolMetadataByCallId.clear();

    // Clear any in-flight overflow-recovery state so a stale fallback timer
    // doesn't fire on a torn-down adapter.
    this.adapter.resetOverflowState();
  }

  // ============================================================
  // Mini Completion (for title generation + summarization)
  // ============================================================

  /**
   * Run a simple text completion via the subprocess.
   * Sends a mini_completion request and waits for the result.
   */
  async runMiniCompletion(prompt: string): Promise<string | null> {
    // If subprocess isn't running, spawn it
    await this.ensureSubprocess();

    const id = `mini-${++this.rpcIdCounter}`;
    const resultPromise = new Promise<string | null>((resolve, reject) => {
      this.pendingMiniCompletions.set(id, { resolve, reject });
    });

    this.send({ type: 'mini_completion', id, prompt });

    // Keep this aligned with the subprocess-side queryLlm timeout.
    const timeout = new Promise<string | null>((resolve) => {
      setTimeout(() => {
        if (this.pendingMiniCompletions.has(id)) {
          this.pendingMiniCompletions.delete(id);
          this.debug(`[runMiniCompletion] Timed out after ${LLM_QUERY_TIMEOUT_MS / 1000}s`);
          resolve(null);
        }
      }, LLM_QUERY_TIMEOUT_MS);
    });

    const text = await Promise.race([resultPromise, timeout]);
    this.debug(`[runMiniCompletion] Result: ${text ? `"${text.slice(0, 200)}"` : 'null'}`);
    return text;
  }

  /**
   * Execute an LLM query via the subprocess.
   * Used by session-scoped tool callbacks (call_llm).
   *
   * Sends the full LLMQueryRequest over the `llm_query` RPC so the subprocess's
   * model-aware queryLlm() can honor `request.model`, `request.systemPrompt`,
   * and (transitively via buildCallLlmRequest) `request.outputSchema`.
   * See packages/shared/CLAUDE.md → "queryLlm backend contract" and
   * packages/pi-agent-server/src/index.ts → handleLlmQuery for the invariant.
   */
  async queryLlm(request: LLMQueryRequest): Promise<LLMQueryResult> {
    this.debug('[PiAgent.queryLlm] Starting');

    await this.ensureSubprocess();

    const id = `llm-${++this.rpcIdCounter}`;
    const resultPromise = new Promise<LLMQueryResult>((resolve, reject) => {
      this.pendingLlmQueries.set(id, { resolve, reject });
    });

    this.send({ type: 'llm_query', id, request });

    // Keep this aligned with the subprocess-side queryLlm timeout.
    const timeout = new Promise<LLMQueryResult>((_, reject) => {
      setTimeout(() => {
        if (this.pendingLlmQueries.has(id)) {
          this.pendingLlmQueries.delete(id);
          reject(new Error(`queryLlm timed out after ${LLM_QUERY_TIMEOUT_MS / 1000}s`));
        }
      }, LLM_QUERY_TIMEOUT_MS);
    });

    return Promise.race([resultPromise, timeout]);
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * Resolve working directory to an absolute path.
   * BaseAgent stores paths with tilde (~) but Node.js spawn doesn't expand tilde.
   */
  private resolvedCwd(): string {
    const wd = this.workingDirectory;
    if (wd.startsWith('~/')) return join(homedir(), wd.slice(2));
    if (wd === '~') return homedir();
    return wd;
  }

  // ============================================================
  // Error Parsing
  // ============================================================

  /**
   * Parse a Pi error into a typed AgentError.
   */
  private parsePiError(error: Error): AgentError {
    const errorMessage = error.message.toLowerCase();

    // Auth errors
    if (
      errorMessage.includes('api key') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('401') ||
      errorMessage.includes('authentication')
    ) {
      return {
        code: 'invalid_api_key',
        title: 'Invalid API Key',
        message: 'Your API key was rejected. Check your credentials in Settings.',
        actions: [
          { key: 's', label: 'Update API key', command: '/settings', action: 'settings' },
        ],
        canRetry: false,
        originalError: error.message,
      };
    }

    // Rate limiting
    if (errorMessage.includes('rate') || errorMessage.includes('429')) {
      return {
        code: 'rate_limited',
        title: 'Rate Limited',
        message: 'Too many requests. Please wait a moment before trying again.',
        actions: [
          { key: 'r', label: 'Retry', action: 'retry' },
        ],
        canRetry: true,
        retryDelayMs: 5000,
        originalError: error.message,
      };
    }

    // Service errors
    if (
      errorMessage.includes('500') ||
      errorMessage.includes('502') ||
      errorMessage.includes('503') ||
      errorMessage.includes('service') ||
      errorMessage.includes('overloaded')
    ) {
      return {
        code: 'service_error',
        title: 'Service Error',
        message: 'The AI service is temporarily unavailable. Please try again.',
        actions: [
          { key: 'r', label: 'Retry', action: 'retry' },
        ],
        canRetry: true,
        retryDelayMs: 2000,
        originalError: error.message,
      };
    }

    // Network errors
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('fetch failed')
    ) {
      return {
        code: 'network_error',
        title: 'Connection Error',
        message: 'Could not connect to the server. Check your internet connection.',
        actions: [
          { key: 'r', label: 'Retry', action: 'retry' },
        ],
        canRetry: true,
        retryDelayMs: 1000,
        originalError: error.message,
      };
    }

    // Fall back to shared error parsing
    return parseError(error);
  }

  // ============================================================
  // Debug
  // ============================================================

  protected override debug(message: string): void {
    this.onDebug?.(`[pi] ${message}`);
  }
}

// Alias for consistency with other backend naming
export { PiAgent as PiBackend };
