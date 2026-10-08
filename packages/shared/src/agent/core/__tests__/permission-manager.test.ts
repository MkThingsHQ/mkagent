/**
 * Tests for PermissionManager
 *
 * Tests the centralized permission evaluation system used by both
 * ClaudeAgent and PiAgent.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { PermissionManager } from '../permission-manager.ts';
import { initializeModeState, cleanupModeState } from '../../mode-manager.ts';

// Test session ID
const TEST_SESSION_ID = 'test-session-12345';

describe('PermissionManager', () => {
  let permissionManager: PermissionManager;

  beforeEach(() => {
    // Clean up any previous mode state
    cleanupModeState(TEST_SESSION_ID);

    // Initialize mode state for test session
    initializeModeState(TEST_SESSION_ID, 'ask');

    // Create a fresh PermissionManager
    permissionManager = new PermissionManager({
      workspaceId: 'test-workspace',
      sessionId: TEST_SESSION_ID,
      workingDirectory: '/test/workspace',
      plansFolderPath: '/test/workspace/plans',
    });
  });

  describe('Permission Mode Management', () => {
    it('should return the current permission mode', () => {
      const mode = permissionManager.getPermissionMode();
      expect(mode).toBe('ask');
    });

    it('should set the permission mode', () => {
      permissionManager.setPermissionMode('safe');
      expect(permissionManager.getPermissionMode()).toBe('safe');

      permissionManager.setPermissionMode('allow-all');
      expect(permissionManager.getPermissionMode()).toBe('allow-all');
    });

    it('should cycle through permission modes', () => {
      // Starting from 'ask'
      permissionManager.setPermissionMode('ask');

      const nextMode = permissionManager.cyclePermissionMode();
      expect(nextMode).toBe('allow-all');

      const nextMode2 = permissionManager.cyclePermissionMode();
      expect(nextMode2).toBe('safe');

      const nextMode3 = permissionManager.cyclePermissionMode();
      expect(nextMode3).toBe('ask');
    });
  });

  describe('Command Analysis', () => {
    it('should extract base command from simple commands', () => {
      expect(permissionManager.getBaseCommand('ls -la')).toBe('ls');
      expect(permissionManager.getBaseCommand('git status')).toBe('git');
      expect(permissionManager.getBaseCommand('npm install')).toBe('npm');
    });

    it('should handle sudo prefix', () => {
      expect(permissionManager.getBaseCommand('sudo rm -rf /')).toBe('rm');
      expect(permissionManager.getBaseCommand('sudo apt-get update')).toBe('apt-get');
    });

  });

  describe('Session-Scoped Whitelisting', () => {
    it('should start with no whitelisted commands', () => {
      expect(permissionManager.isCommandWhitelisted('ls')).toBe(false);
      expect(permissionManager.isCommandWhitelisted('git')).toBe(false);
    });

    it('should whitelist commands', () => {
      permissionManager.whitelistCommand('ls');
      expect(permissionManager.isCommandWhitelisted('ls')).toBe(true);
      expect(permissionManager.isCommandWhitelisted('git')).toBe(false);
    });

    it('should be case-insensitive for command whitelisting', () => {
      permissionManager.whitelistCommand('Git');
      expect(permissionManager.isCommandWhitelisted('git')).toBe(true);
      expect(permissionManager.isCommandWhitelisted('GIT')).toBe(true);
    });

    it('should whitelist domains', () => {
      permissionManager.whitelistDomain('api.example.com');
      expect(permissionManager.isDomainWhitelisted('api.example.com')).toBe(true);
      expect(permissionManager.isDomainWhitelisted('other.example.com')).toBe(false);
    });

    it('should be case-insensitive for domain whitelisting', () => {
      permissionManager.whitelistDomain('API.Example.COM');
      expect(permissionManager.isDomainWhitelisted('api.example.com')).toBe(true);
    });

    it('should clear all whitelists', () => {
      permissionManager.whitelistCommand('ls');
      permissionManager.whitelistDomain('example.com');

      permissionManager.clearWhitelists();

      expect(permissionManager.isCommandWhitelisted('ls')).toBe(false);
      expect(permissionManager.isDomainWhitelisted('example.com')).toBe(false);
    });

    it('should remember exactly the key or domains a prompt offered', () => {
      permissionManager.remember({ kind: 'command', key: 'git commit' });
      permissionManager.remember({ kind: 'domains', domains: ['api.example.com', 'cdn.example.com'] });

      expect(permissionManager.isCommandWhitelisted('git commit')).toBe(true);
      expect(permissionManager.isCommandWhitelisted('git')).toBe(false);
      expect(permissionManager.isDomainWhitelisted('api.example.com')).toBe(true);
      expect(permissionManager.isDomainWhitelisted('cdn.example.com')).toBe(true);
    });

    it('should return copies of whitelisted sets for debugging', () => {
      permissionManager.whitelistCommand('ls');
      permissionManager.whitelistDomain('example.com');

      const commands = permissionManager.getWhitelistedCommands();
      const domains = permissionManager.getWhitelistedDomains();

      expect(commands.has('ls')).toBe(true);
      expect(domains.has('example.com')).toBe(true);

      // Verify they are copies (modifying shouldn't affect internal state)
      commands.delete('ls');
      expect(permissionManager.isCommandWhitelisted('ls')).toBe(true);
    });
  });

  describe('Bash Permission Requirements', () => {
    it('should not require permission in execute mode', () => {
      permissionManager.setPermissionMode('allow-all');
      expect(permissionManager.requiresBashPermission('rm -rf /')).toBe(false);
    });

    it('should not require permission in explore mode (blocks instead)', () => {
      permissionManager.setPermissionMode('safe');
      expect(permissionManager.requiresBashPermission('rm -rf /')).toBe(false);
    });

    it('should require permission for dangerous commands in ask mode', () => {
      permissionManager.setPermissionMode('ask');
      expect(permissionManager.requiresBashPermission('rm file.txt')).toBe(true);
      expect(permissionManager.requiresBashPermission('sudo rm -rf /')).toBe(true); // sudo itself is dangerous
      expect(permissionManager.requiresBashPermission('git push --force')).toBe(true); // two-word entry
      expect(permissionManager.requiresBashPermission('ls && rm -rf ~')).toBe(true); // chains hide commands
      expect(permissionManager.requiresBashPermission('curl https://example.com')).toBe(true);
      expect(permissionManager.requiresBashPermission('wget http://example.com/file')).toBe(true);
    });

    it('should not require permission for plain safe commands in ask mode', () => {
      permissionManager.setPermissionMode('ask');
      expect(permissionManager.requiresBashPermission('ls -la')).toBe(false);
      expect(permissionManager.requiresBashPermission('git commit -m x')).toBe(false);
    });
  });

  describe('Context Management', () => {
    it('should update working directory', () => {
      permissionManager.updateWorkingDirectory('/new/path');
      // Verify internally by checking the permissions context is updated
      const context = permissionManager.getPermissionsContext();
      expect(context.workspaceRootPath).toBe('/new/path');
    });

    it('should update plans folder path', () => {
      permissionManager.updatePlansFolderPath('/new/plans/path');
      // The plans folder path is used internally for permission checks
      // No direct getter, but we can verify no errors occur
    });

    it('should return the session ID', () => {
      expect(permissionManager.getSessionId()).toBe(TEST_SESSION_ID);
    });
  });
});
