/**
 * Tests for the retained Browser and Skill prerequisite reading system.
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrerequisiteManager } from '../prerequisite-manager.ts';

const originalReadFileSync = readFileSync;
let mockExistsPaths = new Set<string>();
const CONFIG_DEFAULTS_PATH = join(homedir(), '.mkagent', 'config-defaults.json');
const CONFIG_DEFAULTS = JSON.stringify({
  version: '1.0',
  defaults: { browserToolEnabled: true },
  workspaceDefaults: { permissionMode: 'ask', cyclablePermissionModes: ['ask'] },
});

mock.module('node:fs', () => ({
  existsSync: (path: string) => path === CONFIG_DEFAULTS_PATH || mockExistsPaths.has(path),
  readFileSync: (path: string, options?: unknown) => path === CONFIG_DEFAULTS_PATH
    ? CONFIG_DEFAULTS
    : originalReadFileSync(path, options as never),
}));

const WORKSPACE_ROOT = '/test/workspace';
const BROWSER_DOC_PATH = resolve(join(homedir(), '.mkagent', 'docs', 'browser-tools.md'));

describe('PrerequisiteManager', () => {
  let manager: PrerequisiteManager;
  let debugMessages: string[];

  beforeEach(() => {
    debugMessages = [];
    mockExistsPaths = new Set();
    manager = new PrerequisiteManager({
      workspaceRootPath: WORKSPACE_ROOT,
      onDebug: message => debugMessages.push(message),
    });
  });

  describe('Browser instructions', () => {
    it('does not block unrelated built-in tools', () => {
      expect(manager.checkPrerequisites('Read').allowed).toBe(true);
      expect(manager.checkPrerequisites('Bash').allowed).toBe(true);
      expect(manager.checkPrerequisites('Write').allowed).toBe(true);
    });

    it('blocks the retained browser tool until its documentation is read', () => {
      mockExistsPaths.add(BROWSER_DOC_PATH);
      const result = manager.checkPrerequisites('browser_tool');
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toContain(BROWSER_DOC_PATH);
    });

    it('blocks the session-prefixed browser tool until its documentation is read', () => {
      mockExistsPaths.add(BROWSER_DOC_PATH);
      expect(manager.checkPrerequisites('mcp__session__browser_tool').allowed).toBe(false);
    });

    it('allows the browser tool when the documentation is not installed', () => {
      expect(manager.checkPrerequisites('browser_tool').allowed).toBe(true);
    });

    it('allows the browser tool after its documentation is read', () => {
      mockExistsPaths.add(BROWSER_DOC_PATH);
      expect(manager.checkPrerequisites('browser_tool').allowed).toBe(false);
      manager.trackReadTool({ file_path: BROWSER_DOC_PATH });
      expect(manager.checkPrerequisites('browser_tool').allowed).toBe(true);
    });

    it('never bypasses the strict browser prerequisite after repeated attempts', () => {
      mockExistsPaths.add(BROWSER_DOC_PATH);
      expect(manager.checkPrerequisites('browser_tool').allowed).toBe(false);
      expect(manager.checkPrerequisites('browser_tool').allowed).toBe(false);
    });
  });

  describe('Skill instructions', () => {
    const skillPath = '/test/workspace/skills/example/SKILL.md';

    it('blocks other tools until the registered Skill is read', () => {
      manager.registerSkillPrerequisites([skillPath]);
      expect(manager.checkPrerequisites('WebSearch').allowed).toBe(false);
      manager.trackReadTool({ path: skillPath });
      expect(manager.checkPrerequisites('WebSearch').allowed).toBe(true);
    });

    it('allows Read so the prerequisite can be satisfied', () => {
      manager.registerSkillPrerequisites([skillPath]);
      expect(manager.checkPrerequisites('Read').allowed).toBe(true);
    });

    it('clears Skill prerequisites read through Bash', () => {
      manager.registerSkillPrerequisites([skillPath]);
      expect(manager.trackBashSkillRead({ command: `cat ${skillPath}` })).toBe(true);
      expect(manager.checkPrerequisites('WebSearch').allowed).toBe(true);
    });

    it('ignores unrelated Bash commands', () => {
      manager.registerSkillPrerequisites([skillPath]);
      expect(manager.trackBashSkillRead({ command: 'ls -la /tmp' })).toBe(false);
    });

    it('falls back after the bounded rejection count', () => {
      manager.registerSkillPrerequisites([skillPath]);
      expect(manager.checkPrerequisites('WebSearch').allowed).toBe(false);
      expect(manager.checkPrerequisites('WebSearch').allowed).toBe(true);
    });

    it('restores rejection behavior when state is reset', () => {
      manager.registerSkillPrerequisites([skillPath]);
      manager.checkPrerequisites('WebSearch');
      manager.checkPrerequisites('WebSearch');
      manager.resetReadState();
      manager.registerSkillPrerequisites([skillPath]);
      expect(manager.checkPrerequisites('WebSearch').allowed).toBe(false);
    });
  });

  describe('debug logging', () => {
    it('logs blocks, tracked reads, and resets', () => {
      mockExistsPaths.add(BROWSER_DOC_PATH);
      manager.checkPrerequisites('browser_tool');
      manager.trackReadTool({ file_path: BROWSER_DOC_PATH });
      manager.resetReadState();

      expect(debugMessages.some(message => message.includes('Prerequisite blocked'))).toBe(true);
      expect(debugMessages.some(message => message.includes('tracked read'))).toBe(true);
      expect(debugMessages.some(message => message.includes('reset read state'))).toBe(true);
    });
  });
});
