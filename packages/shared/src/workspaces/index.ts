/**
 * Workspace Module
 *
 * Re-exports types and storage functions for workspaces.
 */

// Types
export type {
  WorkspaceConfig,
  CreateWorkspaceInput,
  LoadedWorkspace,
  WorkspaceSummary,
} from './types.ts';

// Storage functions
export {
  // Path utilities
  getDefaultWorkspacesDir,
  ensureDefaultWorkspacesDir,
  ensureDefaultWorkspace,
  getWorkspacePath,
  getWorkspaceSourcesPath,
  getWorkspaceSessionsPath,
  getWorkspaceSkillsPath,
  // Config operations
  loadWorkspaceConfig,
  saveWorkspaceConfig,
  // Load operations
  loadWorkspace,
  getWorkspaceSummary,
  // Create/Delete operations
  generateSlug,
  generateUniqueWorkspacePath,
  createWorkspaceAtPath,
  deleteWorkspaceFolder,
  isValidWorkspace,
  renameWorkspaceFolder,
  isLocalMcpEnabled,
  // Auto-discovery
  discoverWorkspacesInDefaultLocation,
  // Constants
  CONFIG_DIR,
  DEFAULT_WORKSPACES_DIR,
} from './storage.ts';
