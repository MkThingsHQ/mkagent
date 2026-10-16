import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsManager, type ExtensionAPI, type InlineExtension } from '@earendil-works/pi-coding-agent';
import { resolveCraftAgentDir } from './agent-dir.ts';
import { createMkAgentSettingsManager } from './session-settings.ts';
import {
  CRAFT_SYSTEM_PROMPT_EXTENSION_NAME,
  createCraftResourceLoader,
  createSystemPromptOverride,
} from './system-prompt-override.ts';

/**
 * Regression contract for craft-agents-oss#648.
 *
 * Pi rebuilds its own system prompt on every `session.prompt()` and whenever the
 * tool loadout changes. The only supported way to replace the whole prompt is a
 * `before_agent_start` handler returning `{ systemPrompt }`, which the SDK applies
 * per run. These tests pin that the override registers exactly that handler,
 * stays silent until Craft sets a prompt, and always returns the latest prompt.
 */

type Handler = (event: unknown, ctx: unknown) => unknown;

function loadInline(extension: InlineExtension): Map<string, Handler[]> {
  const handlers = new Map<string, Handler[]>();
  const pi = {
    on(event: string, handler: Handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () => {};
    },
  } as unknown as ExtensionAPI;
  const factory = typeof extension === 'function' ? extension : extension.factory;
  void factory(pi);
  return handlers;
}

function invoke(handlers: Map<string, Handler[]>): unknown {
  const [handler, ...rest] = handlers.get('before_agent_start') ?? [];
  expect(handler).toBeDefined();
  expect(rest).toHaveLength(0);
  return handler!({ type: 'before_agent_start', prompt: 'hi', systemPrompt: 'SDK PROMPT' }, {});
}

describe('createSystemPromptOverride', () => {
  it('registers a single hidden before_agent_start handler under a stable inline name', () => {
    const override = createSystemPromptOverride();
    expect(override.extension).toMatchObject({ name: CRAFT_SYSTEM_PROMPT_EXTENSION_NAME, hidden: true });
    const handlers = loadInline(override.extension);
    expect([...handlers.keys()]).toEqual(['before_agent_start']);
  });

  it('leaves the SDK prompt alone until a prompt is set', () => {
    const override = createSystemPromptOverride();
    const handlers = loadInline(override.extension);
    expect(override.current()).toBeUndefined();
    expect(invoke(handlers)).toBeUndefined();
  });

  it('forces the exact Craft prompt once set, on every run', () => {
    const override = createSystemPromptOverride();
    const handlers = loadInline(override.extension);
    override.set('CRAFT_PROMPT');
    expect(invoke(handlers)).toEqual({ systemPrompt: 'CRAFT_PROMPT' });
    expect(invoke(handlers)).toEqual({ systemPrompt: 'CRAFT_PROMPT' });
    expect(override.current()).toBe('CRAFT_PROMPT');
  });

  it('a later set() replaces the forced prompt for the next run', () => {
    const override = createSystemPromptOverride();
    const handlers = loadInline(override.extension);
    override.set('FIRST');
    override.set('SECOND');
    expect(invoke(handlers)).toEqual({ systemPrompt: 'SECOND' });
  });
});

describe('createCraftResourceLoader', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('loads the override as an inline extension through the SDK loader', async () => {
    const root = mkdtempSync(join(tmpdir(), 'craft-pi-loader-'));
    dirs.push(root);
    const loader = await createCraftResourceLoader({
      cwd: root,
      agentDir: join(root, '.pi-agent'),
      settingsManager: SettingsManager.inMemory(),
      systemPromptOverride: createSystemPromptOverride(),
    });
    const { extensions, errors } = loader.getExtensions();
    expect(errors).toEqual([]);
    expect(extensions.some(ext => ext.path === `<inline:${CRAFT_SYSTEM_PROMPT_EXTENSION_NAME}>`)).toBe(true);
  });

  /** A working directory whose `.pi/extensions` would leave a marker file when loaded. */
  function repoWithProjectExtension(): { cwd: string; marker: string } {
    const cwd = mkdtempSync(join(tmpdir(), 'craft-pi-repo-'));
    dirs.push(cwd);
    const marker = join(cwd, 'extension-ran');
    mkdirSync(join(cwd, '.pi', 'extensions'), { recursive: true });
    writeFileSync(
      join(cwd, '.pi', 'extensions', 'repo-extension.ts'),
      `import { writeFileSync } from 'node:fs';\n` +
        `export default function repoExtension() { writeFileSync(${JSON.stringify(marker)}, 'ran'); }\n`,
    );
    return { cwd, marker };
  }

  it('loads nothing but the override for Craft sessions (no project, global or built-in extensions)', async () => {
    const { cwd, marker } = repoWithProjectExtension();
    const sessionPath = mkdtempSync(join(tmpdir(), 'craft-pi-session-'));
    dirs.push(sessionPath);
    for (const purpose of ['main', 'ephemeral'] as const) {
      const loader = await createCraftResourceLoader({
        cwd,
        agentDir: resolveCraftAgentDir({ sessionPath }),
        settingsManager: createMkAgentSettingsManager(purpose),
        systemPromptOverride: createSystemPromptOverride(),
      });
      const { extensions, errors } = loader.getExtensions();
      expect(errors).toEqual([]);
      expect(extensions.map(ext => ext.path)).toEqual([`<inline:${CRAFT_SYSTEM_PROMPT_EXTENSION_NAME}>`]);
    }
    expect(existsSync(marker)).toBe(false);
  });

  it('control: a trusted project (the SDK default) would run the repository extension', async () => {
    const { cwd, marker } = repoWithProjectExtension();
    const loader = await createCraftResourceLoader({
      cwd,
      agentDir: join(cwd, '.pi-agent'),
      settingsManager: SettingsManager.inMemory(),
      systemPromptOverride: createSystemPromptOverride(),
    });
    expect(loader.getExtensions().extensions.some(ext => ext.path.endsWith('repo-extension.ts'))).toBe(true);
    expect(existsSync(marker)).toBe(true);
  });
});
