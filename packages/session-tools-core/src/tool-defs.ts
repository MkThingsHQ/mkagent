import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { SessionToolContext } from './context.ts';
import {
  handleConfigValidate,
  handleArchiveSession,
  handleGetSessionInfo,
  handleListBackgroundTasks,
  handleListSessions,
  handleMermaidValidate,
  handleScriptSandbox,
  handleSendAgentMessage,
  handleSendDeveloperFeedback,
  handleSkillValidate,
  handleSubmitPlan,
  handleTransformData,
  handleUpdatePreferences,
} from './handlers/index.ts';
import type { ToolResult } from './types.ts';

export const SubmitPlanSchema = z.object({ planPath: z.string() });
export const ConfigValidateSchema = z.object({
  target: z.enum(['config', 'preferences', 'permissions', 'tool-icons', 'all']),
});
export const SkillValidateSchema = z.object({ skillSlug: z.string() });
export const MermaidValidateSchema = z.object({
  code: z.string(),
  render: z.boolean().optional(),
});
export const CallLlmSchema = z.object({
  prompt: z.string(),
  attachments: z
    .array(
      z.union([
        z.string(),
        z.object({
          path: z.string(),
          startLine: z.number().optional(),
          endLine: z.number().optional(),
        }),
      ])
    )
    .optional(),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  thinking: z.boolean().optional(),
  thinkingBudget: z.number().optional(),
  outputFormat: z
    .enum(['summary', 'classification', 'extraction', 'analysis', 'comparison', 'validation'])
    .optional(),
  outputSchema: z
    .object({
      type: z.literal('object'),
      properties: z.record(z.string(), z.unknown()),
      required: z.array(z.string()).optional(),
    })
    .optional(),
});
export const UpdatePreferencesSchema = z.object({
  name: z.string().optional(),
  timezone: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  includeCoAuthoredBy: z.boolean().optional(),
});
export const TransformDataSchema = z.object({
  language: z.enum(['python3', 'node', 'bun']),
  script: z.string(),
  inputFiles: z.array(z.string()),
  outputFile: z.string(),
});
export const ScriptSandboxSchema = z.object({
  language: z.enum(['python3', 'node', 'bun']),
  script: z.string(),
  inputFiles: z.array(z.string()).optional(),
  stdin: z.string().optional(),
  timeoutMs: z.number().min(1).max(15000).optional(),
});
export const SendDeveloperFeedbackSchema = z.object({ message: z.string() });
export const BrowserToolSchema = z.object({
  command: z.union([z.string(), z.array(z.string())]),
});
export const SpawnSessionSchema = z.object({
  help: z.boolean().optional(),
  prompt: z.string().optional(),
  name: z.string().optional(),
  llmConnection: z.string().optional(),
  model: z.string().optional(),
  permissionMode: z.enum(['safe', 'ask', 'allow-all']).optional(),
  thinkingLevel: z.enum(['off', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  workingDirectory: z.string().optional(),
  attachments: z
    .array(z.object({ path: z.string(), name: z.string().optional() }))
    .optional(),
});
export const GetSessionInfoSchema = z.object({ sessionId: z.string().optional() });
export const ArchiveSessionSchema = z.object({
  sessionId: z.string(),
  archived: z.boolean().optional(),
});
export const ListSessionsSchema = z.object({
  search: z.string().optional(),
  sortBy: z.enum(['recent', 'name']).optional(),
  archived: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});
export const ListBackgroundTasksSchema = z.object({ sessionId: z.string().optional() });
export const SendAgentMessageSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
  attachments: z
    .array(z.object({ path: z.string(), name: z.string().optional() }))
    .optional(),
});

export const TOOL_DESCRIPTIONS = {
  SubmitPlan: 'Submit a written plan for user review and pause execution until it is accepted, modified, or rejected.',
  config_validate: 'Validate MkAgent config, preferences, permissions, tool icons, or all retained configuration.',
  skill_validate: 'Validate a SKILL.md file discovered from project, workspace, or global scope.',
  mermaid_validate: 'Validate Mermaid syntax and optionally render the diagram.',
  update_user_preferences: 'Update confirmed user preferences. Never infer or guess preference values.',
  transform_data: 'Transform session or Skill data into a persisted result using Python, Node, or Bun.',
  script_sandbox: 'Execute a short script with filesystem and network isolation.',
  send_developer_feedback: 'Send detailed Markdown feedback to the MkAgent development team.',
  call_llm: 'Invoke the configured mini model for a focused subtask.',
  spawn_session: 'Create an independent local session using an available Pi connection and model.',
  browser_tool: 'Control the built-in browser with a CLI-like command.',
  archive_session: 'Archive or unarchive another session in this workspace by ID.',
  get_session_info: 'Get metadata for the current session or a session by ID.',
  list_sessions: 'Search and list active or archived sessions in the current workspace.',
  list_background_tasks: 'List background tasks tracked for a session across turns.',
  send_agent_message: 'Send a message and optional attachments to another local session.',
} as const;

export type SessionToolHandler = (
  ctx: SessionToolContext,
  args: any
) => Promise<ToolResult>;
export type SessionToolExecutionMode = 'registry' | 'backend';
export type SessionToolSafeMode = 'allow' | 'block';

interface SessionToolDefBase {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  safeMode: SessionToolSafeMode;
  readOnly?: boolean;
}

export interface RegistrySessionToolDef extends SessionToolDefBase {
  executionMode: 'registry';
  handler: SessionToolHandler;
}

export interface BackendSessionToolDef extends SessionToolDefBase {
  executionMode: 'backend';
  handler: null;
}

export type SessionToolDef = RegistrySessionToolDef | BackendSessionToolDef;

export const SESSION_TOOL_DEFS: SessionToolDef[] = [
  { name: 'SubmitPlan', description: TOOL_DESCRIPTIONS.SubmitPlan, inputSchema: SubmitPlanSchema, executionMode: 'registry', safeMode: 'allow', handler: handleSubmitPlan },
  { name: 'config_validate', description: TOOL_DESCRIPTIONS.config_validate, inputSchema: ConfigValidateSchema, executionMode: 'registry', safeMode: 'allow', readOnly: true, handler: handleConfigValidate },
  { name: 'skill_validate', description: TOOL_DESCRIPTIONS.skill_validate, inputSchema: SkillValidateSchema, executionMode: 'registry', safeMode: 'allow', readOnly: true, handler: handleSkillValidate },
  { name: 'mermaid_validate', description: TOOL_DESCRIPTIONS.mermaid_validate, inputSchema: MermaidValidateSchema, executionMode: 'registry', safeMode: 'allow', readOnly: true, handler: handleMermaidValidate },
  { name: 'update_user_preferences', description: TOOL_DESCRIPTIONS.update_user_preferences, inputSchema: UpdatePreferencesSchema, executionMode: 'registry', safeMode: 'block', handler: handleUpdatePreferences },
  { name: 'transform_data', description: TOOL_DESCRIPTIONS.transform_data, inputSchema: TransformDataSchema, executionMode: 'registry', safeMode: 'allow', handler: handleTransformData },
  { name: 'script_sandbox', description: TOOL_DESCRIPTIONS.script_sandbox, inputSchema: ScriptSandboxSchema, executionMode: 'registry', safeMode: 'allow', handler: handleScriptSandbox },
  { name: 'send_developer_feedback', description: TOOL_DESCRIPTIONS.send_developer_feedback, inputSchema: SendDeveloperFeedbackSchema, executionMode: 'registry', safeMode: 'allow', handler: handleSendDeveloperFeedback },
  { name: 'call_llm', description: TOOL_DESCRIPTIONS.call_llm, inputSchema: CallLlmSchema, executionMode: 'backend', safeMode: 'allow', readOnly: true, handler: null },
  { name: 'spawn_session', description: TOOL_DESCRIPTIONS.spawn_session, inputSchema: SpawnSessionSchema, executionMode: 'backend', safeMode: 'block', handler: null },
  { name: 'browser_tool', description: TOOL_DESCRIPTIONS.browser_tool, inputSchema: BrowserToolSchema, executionMode: 'backend', safeMode: 'allow', handler: null },
  { name: 'archive_session', description: TOOL_DESCRIPTIONS.archive_session, inputSchema: ArchiveSessionSchema, executionMode: 'registry', safeMode: 'block', handler: handleArchiveSession },
  { name: 'get_session_info', description: TOOL_DESCRIPTIONS.get_session_info, inputSchema: GetSessionInfoSchema, executionMode: 'registry', safeMode: 'allow', readOnly: true, handler: handleGetSessionInfo },
  { name: 'list_sessions', description: TOOL_DESCRIPTIONS.list_sessions, inputSchema: ListSessionsSchema, executionMode: 'registry', safeMode: 'allow', readOnly: true, handler: handleListSessions },
  { name: 'list_background_tasks', description: TOOL_DESCRIPTIONS.list_background_tasks, inputSchema: ListBackgroundTasksSchema, executionMode: 'registry', safeMode: 'allow', readOnly: true, handler: handleListBackgroundTasks },
  { name: 'send_agent_message', description: TOOL_DESCRIPTIONS.send_agent_message, inputSchema: SendAgentMessageSchema, executionMode: 'registry', safeMode: 'block', handler: handleSendAgentMessage },
];

export interface SessionToolFilterOptions {
  includeDeveloperFeedback?: boolean;
}

export function getSessionToolDefs(options?: SessionToolFilterOptions): SessionToolDef[] {
  if (options?.includeDeveloperFeedback === false) {
    return SESSION_TOOL_DEFS.filter(def => def.name !== 'send_developer_feedback');
  }
  return SESSION_TOOL_DEFS;
}

export function getSessionToolRegistry(options?: SessionToolFilterOptions): Map<string, SessionToolDef> {
  return new Map(getSessionToolDefs(options).map(def => [def.name, def]));
}

export function getSessionToolNames(options?: SessionToolFilterOptions): Set<string> {
  return new Set(getSessionToolDefs(options).map(def => def.name));
}

export function getSessionBackendToolNames(options?: SessionToolFilterOptions): Set<string> {
  return new Set(getSessionToolDefs(options).filter(def => def.executionMode === 'backend').map(def => def.name));
}

export function getSessionRegistryToolNames(options?: SessionToolFilterOptions): Set<string> {
  return new Set(getSessionToolDefs(options).filter(def => def.executionMode === 'registry').map(def => def.name));
}

export interface SessionToolNameOptions extends SessionToolFilterOptions {
  prefix?: string;
}

export function getSessionSafeAllowedToolNames(options?: SessionToolNameOptions): Set<string> {
  const prefix = options?.prefix ?? '';
  return new Set(getSessionToolDefs(options).filter(def => def.safeMode === 'allow').map(def => `${prefix}${def.name}`));
}

export function getSessionSafeBlockedToolNames(options?: SessionToolNameOptions): Set<string> {
  const prefix = options?.prefix ?? '';
  return new Set(getSessionToolDefs(options).filter(def => def.safeMode === 'block').map(def => `${prefix}${def.name}`));
}

export const SESSION_TOOL_NAMES = getSessionToolNames();
export const SESSION_BACKEND_TOOL_NAMES = getSessionBackendToolNames();
export const SESSION_REGISTRY_TOOL_NAMES = getSessionRegistryToolNames();
export const SESSION_SAFE_ALLOWED_TOOL_NAMES = getSessionSafeAllowedToolNames();
export const SESSION_SAFE_BLOCKED_TOOL_NAMES = getSessionSafeBlockedToolNames();
export const SESSION_TOOL_REGISTRY = getSessionToolRegistry();

export interface JsonSchemaToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export function getToolDefsAsJsonSchema(options?: {
  prefix?: string;
  includeDeveloperFeedback?: boolean;
}): JsonSchemaToolDef[] {
  const prefix = options?.prefix ?? '';
  return getSessionToolDefs(options).map(def => {
    const inputSchema = zodToJsonSchema(def.inputSchema as any, {
      $refStrategy: 'none',
    }) as Record<string, unknown>;
    delete inputSchema.$schema;
    delete inputSchema.additionalProperties;
    return { name: `${prefix}${def.name}`, description: def.description, inputSchema };
  });
}
