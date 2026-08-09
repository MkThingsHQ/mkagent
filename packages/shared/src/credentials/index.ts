/**
 * Credential Storage Module
 *
 * Provides secure credential storage using AES-256-GCM encrypted file.
 * All methods auto-initialize, so explicit initialize() calls are optional.
 *
 * Usage:
 *   import { getCredentialManager } from './credentials';
 *
 *   const manager = getCredentialManager();
 *
 *   // Get/set API key
 *   const apiKey = await manager.getLlmApiKey(connectionSlug);
 *   await manager.setLlmApiKey(connectionSlug, 'sk-...');
 */

export { CredentialManager, getCredentialManager } from './manager.ts';
export type { CredentialId, CredentialType, StoredCredential } from './types.ts';
export { credentialIdToAccount, accountToCredentialId, SOURCE_CREDENTIAL_TYPES } from './types.ts';
export type { CredentialBackend } from './backends/types.ts';
