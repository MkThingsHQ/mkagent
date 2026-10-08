/**
 * PermissionManager - Centralized Tool Permission Evaluation
 *
 * Provides a unified interface for checking tool permissions that both
 * PiAgent uses. Delegates to the existing mode-manager
 * implementation to ensure consistent behavior.
 *
 * Key responsibilities:
 * - Evaluate tool calls against permission mode (explore/ask/execute)
 * - Check bash commands against read-only patterns
 * - Provide detailed rejection reasons for blocked operations
 */

import { homedir } from 'os';
import {
  getPermissionMode,
  setPermissionMode,
  cyclePermissionMode,
  shouldAllowToolInMode,
  getBashRejectionReason,
  formatBashRejectionMessage,
  type ToolCheckResult,
} from '../mode-manager.ts';
import { createLogger } from '../../utils/debug.ts';
import { parseSimpleCommand } from '../bash-validator.ts';
import { permissionsConfigCache, type PermissionsContext } from '../permissions-config.ts';
import type { PermissionMode } from '../mode-types.ts';
import { isDangerousArgv, type PermissionRemember } from './permission-remember.ts';
import type { PermissionManagerConfig, ToolPermissionResult } from './types.ts';

const log = createLogger('permissions');

// Re-export types for convenience
export type { ToolCheckResult, PermissionMode, PermissionRemember };

/**
 * PermissionManager provides centralized permission checking for agent backends.
 *
 * Usage:
 * ```typescript
 * const permManager = new PermissionManager({
 *   workspaceId: workspace.id,
 *   sessionId: session.id,
 *   workingDirectory: session.workingDirectory,
 *   plansFolderPath: getSessionPlansPath(workspace, session.id),
 * });
 *
 * // Check if a tool call is allowed
 * const result = permManager.evaluateToolCall('Bash', { command: 'git status' });
 * if (!result.allowed) {
 *   // Block with reason
 * }
 * ```
 */
export class PermissionManager {
  private config: PermissionManagerConfig;
  private permissionsContext: PermissionsContext;

  // Session-scoped whitelists for "always allow" feature
  private alwaysAllowedCommands: Set<string> = new Set();
  private alwaysAllowedDomains: Set<string> = new Set();

  constructor(config: PermissionManagerConfig) {
    this.config = config;
    // Build permissions context for loading custom permissions
    // PermissionsContext expects workspaceRootPath (absolute path to workspace)
    this.permissionsContext = {
      workspaceRootPath: config.workingDirectory ?? '',
    };
  }

  // ============================================================
  // Permission Mode Management
  // ============================================================

  /**
   * Get the current permission mode for this session.
   */
  getPermissionMode(): PermissionMode {
    return getPermissionMode(this.config.sessionId);
  }

  /**
   * Set the permission mode for this session.
   */
  setPermissionMode(mode: PermissionMode): void {
    setPermissionMode(this.config.sessionId, mode);
  }

  /**
   * Cycle to the next permission mode (explore → ask → execute → explore).
   * Returns the new mode.
   */
  cyclePermissionMode(enabledModes?: PermissionMode[]): PermissionMode {
    return cyclePermissionMode(this.config.sessionId, enabledModes);
  }

  // ============================================================
  // Tool Permission Evaluation
  // ============================================================

  /**
   * Evaluate whether a tool call is allowed under the current permission mode.
   *
   * This is the main entry point for permission checking. It considers:
   * - Current permission mode (explore/ask/execute)
   * - Tool type (Bash, Write, MCP, API, etc.)
   * - Tool input parameters
   * - Custom permission rules from permissions.json
   *
   * @param toolName - Name of the tool being called
   * @param toolInput - Input parameters for the tool
   * @returns ToolPermissionResult with allowed status and reason if blocked
   */
  evaluateToolCall(
    toolName: string,
    toolInput: Record<string, unknown>
  ): ToolPermissionResult {
    const mode = this.getPermissionMode();

    // Use shouldAllowToolInMode which handles all the complex logic
    const result = shouldAllowToolInMode(toolName, toolInput, mode, {
      plansFolderPath: this.config.plansFolderPath,
      dataFolderPath: this.config.dataFolderPath,
      permissionsContext: this.permissionsContext,
    });

    if (result.allowed) {
      if ('requiresPermission' in result && result.requiresPermission) {
        log.info('Tool requires permission', {
          sessionId: this.config.sessionId,
          mode,
          toolName,
          description: result.description,
          toolInput,
        });
        return {
          allowed: true,
          requiresPermission: true,
          description: result.description,
        };
      }
      log.debug('Tool allowed', {
        sessionId: this.config.sessionId,
        mode,
        toolName,
      });
      return { allowed: true };
    }

    log.warn('Tool blocked', {
      sessionId: this.config.sessionId,
      mode,
      toolName,
      reason: result.reason,
      toolInput,
    });

    return {
      allowed: false,
      reason: result.reason,
    };
  }

  /**
   * Check if a bash command is allowed in the current mode.
   * Returns detailed rejection reason if blocked.
   *
   * @param command - The bash command to check
   * @returns null if allowed, or rejection reason string if blocked
   */
  checkBashCommand(command: string): string | null {
    const mode = this.getPermissionMode();

    // In execute (and guarded) mode, all commands are allowed
    if (mode === 'allow-all') {
      return null;
    }

    // In ask mode, commands are allowed but may require confirmation
    if (mode === 'ask') {
      return null;
    }

    // In explore mode, check against read-only patterns
    const config = permissionsConfigCache.getMergedConfig(this.permissionsContext);
    const rejection = getBashRejectionReason(command, config);

    if (!rejection) {
      return null;
    }

    return formatBashRejectionMessage(rejection, config);
  }

  /**
   * Check if a bash command requires user permission in 'ask' mode.
   * Dangerous commands always require permission.
   *
   * @param command - The bash command to check
   * @returns true if permission should be requested
   */
  requiresBashPermission(command: string): boolean {
    const mode = this.getPermissionMode();

    // Execute mode never requires permission (Guarded's prompts come from its risk check)
    if (mode === 'allow-all') {
      return false;
    }

    // Explore mode blocks commands, doesn't ask
    if (mode === 'safe') {
      return false;
    }

    // In ask mode: dangerous commands, and anything that is not one plain command
    // (a chain can hide a dangerous command after a harmless one).
    const argv = parseSimpleCommand(command);
    return argv === null || isDangerousArgv(argv);
  }

  // ============================================================
  // Command Analysis Utilities
  // ============================================================

  /**
   * The first word of a bash command, after an optional `sudo`. For labels and
   * curl/wget detection only: it ignores chains and subcommands, so it must not
   * decide what "Always Allow" remembers (see permission-remember.ts).
   *
   * @param command - Full bash command
   * @returns Base command name
   */
  getBaseCommand(command: string): string {
    const trimmed = command.trim();
    // Extract first word, handling common prefixes
    const match = trimmed.match(/^(?:sudo\s+)?(\S+)/);
    return match?.[1] ?? trimmed.split(/\s+/)[0] ?? '';
  }

  // ============================================================
  // Context Management
  // ============================================================

  /**
   * Update the working directory (used for permission context).
   */
  updateWorkingDirectory(path: string): void {
    this.config.workingDirectory = path;
    this.permissionsContext.workspaceRootPath = path;
  }

  /**
   * Update the plans folder path.
   */
  updatePlansFolderPath(path: string): void {
    this.config.plansFolderPath = path;
  }

  /**
   * Get the current session ID.
   */
  getSessionId(): string {
    return this.config.sessionId;
  }

  /**
   * Get the permissions context for external use.
   */
  getPermissionsContext(): PermissionsContext {
    return this.permissionsContext;
  }

  // ============================================================
  // Session-Scoped Whitelisting
  // ============================================================

  /**
   * Check if a base command has been whitelisted for this session.
   */
  isCommandWhitelisted(baseCommand: string): boolean {
    return this.alwaysAllowedCommands.has(baseCommand.startsWith('exact:') || baseCommand.startsWith('write:') ? baseCommand : baseCommand.toLowerCase());
  }

  /**
   * Whitelist a command key for the remainder of the session.
   */
  whitelistCommand(baseCommand: string): void {
    this.alwaysAllowedCommands.add(baseCommand.startsWith('exact:') || baseCommand.startsWith('write:') ? baseCommand : baseCommand.toLowerCase());
  }

  /**
   * Apply an "Always Allow" answer: remember exactly what the prompt's permission
   * check computed (`PromptInfo.remember`), never a key derived from the prompt text.
   */
  remember(entry: PermissionRemember): void {
    if (entry.kind === 'domains') {
      for (const domain of entry.domains) this.whitelistDomain(domain);
    } else {
      this.whitelistCommand(entry.key);
    }
  }

  /**
   * Check if a domain has been whitelisted for network commands.
   */
  isDomainWhitelisted(domain: string): boolean {
    return this.alwaysAllowedDomains.has(domain.toLowerCase());
  }

  /**
   * Whitelist a domain for network commands.
   * Called when user clicks "Always Allow" for curl/wget to a domain.
   */
  whitelistDomain(domain: string): void {
    this.alwaysAllowedDomains.add(domain.toLowerCase());
  }

  /**
   * Clear all session-scoped whitelists.
   * Called on session clear or dispose.
   */
  clearWhitelists(): void {
    this.alwaysAllowedCommands.clear();
    this.alwaysAllowedDomains.clear();
  }

  /**
   * Get the set of whitelisted commands (for debugging).
   */
  getWhitelistedCommands(): Set<string> {
    return new Set(this.alwaysAllowedCommands);
  }

  /**
   * Get the set of whitelisted domains (for debugging).
   */
  getWhitelistedDomains(): Set<string> {
    return new Set(this.alwaysAllowedDomains);
  }
}
