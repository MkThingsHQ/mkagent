import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupModeState, initializeModeState, shouldAllowToolInMode } from '../../mode-manager.ts';
import { permissionsConfigCache, type PermissionsContext } from '../../permissions-config.ts';
import { shouldPromptInAskMode, type PermissionManagerLike } from '../pre-tool-use.ts';

// Claude Code's Monitor tool runs its `command` in a shell, as Bash does (each output line becomes an
// event). It used to pass every mode unchecked: Explore allowed it, Ask never prompted for it and
// Guarded never looked at it, so a command Explore blocks for Bash ran as a Monitor.
const SESSION = 'monitor-permissions-test';
const originalConfigDir = process.env.CRAFT_CONFIG_DIR;
let configDir: string;
let workspaceRootPath: string;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'monitor-config-'));
  workspaceRootPath = mkdtempSync(join(tmpdir(), 'monitor-workspace-'));
  mkdirSync(join(configDir, 'permissions'), { recursive: true });
  writeFileSync(join(configDir, 'permissions', 'default.json'), JSON.stringify({
    version: '2026-11-02',
    allowedBashPatterns: [{ pattern: '^tail\\b', comment: 'read a file' }],
    allowedMcpPatterns: [],
    allowedApiEndpoints: [],
    allowedWritePaths: [],
  }));
  process.env.CRAFT_CONFIG_DIR = configDir;
  permissionsConfigCache.clear();
});

afterEach(() => {
  if (originalConfigDir === undefined) delete process.env.CRAFT_CONFIG_DIR;
  else process.env.CRAFT_CONFIG_DIR = originalConfigDir;
  permissionsConfigCache.clear();
  cleanupModeState(SESSION);
  rmSync(configDir, { recursive: true, force: true });
  rmSync(workspaceRootPath, { recursive: true, force: true });
});

const context = (): PermissionsContext => ({ workspaceRootPath });
const permissionManager: PermissionManagerLike = {
  isCommandWhitelisted: () => false,
  getBaseCommand: (command: string) => command.split(' ')[0] ?? command,
  isDomainWhitelisted: () => false,
} as never;

const READ = { command: 'tail -f /var/log/system.log', description: 'system log', timeout_ms: 60_000 };
const RUN = { command: 'npm run dev', description: 'dev server', timeout_ms: 60_000 };
const SOCKET = { ws: { url: 'wss://example.com/events' }, description: 'events', timeout_ms: 60_000 };

describe('Monitor commands get the Bash checks', () => {
  it('Explore allows a read-only command and a WebSocket watch, and blocks the rest as for Bash', () => {
    const explore = (input: Record<string, unknown>) => shouldAllowToolInMode('Monitor', input, 'safe', { permissionsContext: context() });
    expect(explore(READ)).toEqual({ allowed: true });
    expect(explore(SOCKET)).toEqual({ allowed: true });
    expect(explore(RUN)).toEqual(shouldAllowToolInMode('Bash', { command: RUN.command }, 'safe', { permissionsContext: context() }));
    expect(explore(RUN).allowed).toBe(false);
  });

  it('Ask prompts for a command that is not read-only, as for Bash', () => {
    const ask = (input: Record<string, unknown>) => shouldPromptInAskMode('Monitor', input, permissionManager, context());
    expect(ask(READ)).toBeNull();
    expect(ask(SOCKET)).toBeNull();
    expect(ask(RUN)).toMatchObject({ promptType: 'bash', command: RUN.command });
    expect(ask(RUN)).toEqual(shouldPromptInAskMode('Bash', { command: RUN.command }, permissionManager, context()));
  });

});
