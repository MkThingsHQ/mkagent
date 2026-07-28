/**
 * @mkagent/shared
 *
 * Shared business logic for MkAgent.
 * Used by the Electron app.
 *
 * Import specific modules via subpath exports:
 *   import { PiAgent } from '@mkagent/shared/agent';
 *   import { loadStoredConfig } from '@mkagent/shared/config';
 *   import { getCredentialManager } from '@mkagent/shared/credentials';
 *   import { debug } from '@mkagent/shared/utils';
 *   import { createWorkspace, loadWorkspace } from '@mkagent/shared/workspaces';
 *
 * Available modules:
 *   - agent: Pi agent runtime and plan tools
 *   - config: Storage, models, preferences
 *   - credentials: Encrypted credential storage
 *   - prompts: System prompt generation
 *   - utils: Debug logging, file handling, summarization
 *   - version: Version and installation management
 *   - workspaces: Workspace management (top-level organizational unit)
 */

// Export branding (standalone, no dependencies)
export * from './branding.ts';
