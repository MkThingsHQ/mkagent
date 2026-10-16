import {
  DefaultResourceLoader,
  type ExtensionAPI,
  type InlineExtension,
  type SettingsManager,
} from '@earendil-works/pi-coding-agent';

/**
 * Force a Craft-built system prompt onto a Pi AgentSession.
 *
 * Since Pi 0.86 the supported way to replace the whole prompt is a
 * `before_agent_start` extension handler that returns `{ systemPrompt }`. The SDK
 * projects that exact text as the single system head of every provider request
 * in the run — including its own retry and compaction `continue()` calls — and
 * clears it when the run ends, so the handler is consulted again on every
 * `session.prompt()`. Pi 0.87 made `agent.state.systemPrompt` read-only and
 * replaced the `_baseSystemPrompt` string internals this module used to stamp
 * (craft-agents-oss#648), so the override now lives in an inline extension that
 * is registered on the session's resource loader at creation time.
 */
export interface SystemPromptOverride {
  /** Inline extension to register via `createCraftResourceLoader`. */
  readonly extension: InlineExtension;
  /** Replace the prompt forced onto the next and every later run. */
  set(prompt: string): void;
  /** The prompt currently forced, or undefined while the SDK prompt is left alone. */
  current(): string | undefined;
}

export const CRAFT_SYSTEM_PROMPT_EXTENSION_NAME = 'craft-system-prompt';

export function createSystemPromptOverride(): SystemPromptOverride {
  let current: string | undefined;
  const factory = (pi: ExtensionAPI): void => {
    pi.on('before_agent_start', () => (current === undefined ? undefined : { systemPrompt: current }));
  };
  return {
    extension: { name: CRAFT_SYSTEM_PROMPT_EXTENSION_NAME, factory, hidden: true },
    set(prompt: string): void {
      current = prompt;
    },
    current: () => current,
  };
}

/**
 * The resource loader `createAgentSession` would build on its own (same cwd,
 * agentDir and settings), plus the system-prompt override extension. Discovery
 * follows the SDK rules for what it is given: Craft passes an empty agentDir
 * (`agent-dir.ts`) and settings that never trust the working directory
 * (`session-settings.ts`), so no on-disk extension, skill or prompt loads.
 */
export async function createCraftResourceLoader(options: {
  cwd: string;
  agentDir: string;
  settingsManager: SettingsManager;
  systemPromptOverride: SystemPromptOverride;
}): Promise<DefaultResourceLoader> {
  const loader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir,
    settingsManager: options.settingsManager,
    extensionFactories: [options.systemPromptOverride.extension],
  });
  await loader.reload();
  return loader;
}
