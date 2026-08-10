/**
 * Workspace Types
 *
 * Workspaces are the top-level organizational unit. Sources, Sessions and Skills
 * are scoped to a workspace.
 *
 * Directory structure:
 * ~/.mkagent/workspaces/{slug}/
 *   ├── config.json      - Workspace settings
 *   ├── sources/         - Data sources (MCP, API, local)
 *   ├── sessions/        - Conversation sessions
 *   └── skills/          - Workspace Skills
 */

import type { PermissionMode } from '../agent/mode-manager.ts';
import type { ThinkingLevel } from '../agent/thinking-levels.ts';

export interface LocalMcpConfig {
  /** Whether stdio-based local MCP servers may be spawned for this workspace. */
  enabled: boolean;
}

/**
 * Workspace configuration (stored in config.json)
 */
export interface WorkspaceConfig {
  id: string;
  name: string;
  slug: string; // Folder name (URL-safe)

  /**
   * Default settings for new sessions in this workspace
   */
  defaults?: {
    model?: string;
    /** Default LLM connection for new sessions (slug). Overrides global default. */
    defaultLlmConnection?: string;
    enabledSourceSlugs?: string[];
    permissionMode?: PermissionMode; // Default permission mode ('safe', 'ask', 'allow-all')
    cyclablePermissionModes?: PermissionMode[]; // Which modes can be cycled with SHIFT+TAB (min 2, default: all 3)
    workingDirectory?: string;
    thinkingLevel?: ThinkingLevel; // Default thinking level for new sessions (default: 'medium')
    colorTheme?: string; // Color theme override for this workspace (preset ID). Undefined = inherit from app default.
  };

  localMcpServers?: LocalMcpConfig;

  createdAt: number;
  updatedAt: number;
}

/**
 * Workspace creation input
 */
export interface CreateWorkspaceInput {
  name: string;
  defaults?: WorkspaceConfig['defaults'];
}

/**
 * Loaded workspace summary
 */
export interface LoadedWorkspace {
  config: WorkspaceConfig;
  sourceSlugs: string[];
  sessionCount: number; // Number of sessions
}

/**
 * Workspace summary for listing (lightweight)
 */
export interface WorkspaceSummary {
  slug: string;
  name: string;
  sourceCount: number;
  sessionCount: number;
  createdAt: number;
  updatedAt: number;
}
