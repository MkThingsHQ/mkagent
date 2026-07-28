/**
 * Workspace and authentication types
 */

/**
 * Client-facing workspace DTO — safe to send over RPC to remote clients.
 * Does not expose server-internal filesystem paths.
 */
export interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;              // Server-computed from rootPath basename
  lastAccessedAt?: number;
  iconUrl?: string;
}

/**
 * Full workspace with server-internal details.
 * Used by server code and local Electron renderer (LOCAL_ONLY channels).
 */
export interface Workspace extends WorkspaceInfo {
  rootPath: string;        // Absolute path to local workspace folder (metadata, config). Auto-created for remote workspaces.
  createdAt: number;
}

// Config stored in JSON file (credentials stored in encrypted file, not here)
export interface StoredConfig {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeSessionId: string | null;  // Currently active session (primary scope)
  model?: string;
}
