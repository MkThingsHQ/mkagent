/** Stores per-connection API keys in the encrypted cross-platform backend. */

import type { LlmAuthType } from '../config/llm-connections.ts';
import { debug } from '../utils/debug.ts';
import { SecureStorageBackend } from './backends/secure-storage.ts';
import type { CredentialBackend } from './backends/types.ts';
import type {
  CredentialHealthIssue,
  CredentialHealthStatus,
  CredentialId,
  StoredCredential,
} from './types.ts';

export class CredentialManager {
  private backends: CredentialBackend[] = [];
  private writeBackend: CredentialBackend | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInitialize().catch(error => {
      this.initPromise = null;
      throw error;
    });
    await this.initPromise;
  }

  private ensureInitializedSync(): void {
    if (this.initialized) return;
    const backend = new SecureStorageBackend();
    this.backends = [backend];
    this.writeBackend = backend;
    this.initialized = true;
    this.initPromise = null;
  }

  private async doInitialize(): Promise<void> {
    const backend = new SecureStorageBackend();
    const available = await backend.isAvailable();
    if (this.initialized) return;
    this.backends = available ? [backend] : [];
    this.writeBackend = this.backends[0] ?? null;
    this.initialized = true;
    debug(`[CredentialManager] Using backend: ${this.writeBackend?.name ?? 'none'}`);
  }

  getActiveBackendName(): string | null {
    return this.writeBackend?.name ?? null;
  }

  async get(id: CredentialId): Promise<StoredCredential | null> {
    await this.ensureInitialized();
    for (const backend of this.backends) {
      try {
        const credential = await backend.get(id);
        if (credential) return credential;
      } catch (error) {
        debug(`[CredentialManager] Error reading from ${backend.name}:`, error);
      }
    }
    return null;
  }

  async set(id: CredentialId, credential: StoredCredential): Promise<void> {
    await this.ensureInitialized();
    if (!this.writeBackend) throw new Error('No writable credential backend available');
    await this.writeBackend.set(id, credential);
  }

  async delete(id: CredentialId): Promise<boolean> {
    await this.ensureInitialized();
    let deleted = false;
    for (const backend of this.backends) deleted = (await backend.delete(id)) || deleted;
    return deleted;
  }

  deleteSync(id: CredentialId): boolean {
    this.ensureInitializedSync();
    let deleted = false;
    for (const backend of this.backends) deleted = (backend.deleteSync?.(id) ?? false) || deleted;
    return deleted;
  }

  async list(filter?: Partial<CredentialId>): Promise<CredentialId[]> {
    await this.ensureInitialized();
    const results = new Map<string, CredentialId>();
    for (const backend of this.backends) {
      for (const id of await backend.list(filter)) results.set(`${id.type}:${id.connectionSlug}`, id);
    }
    return [...results.values()];
  }

  async getLlmApiKey(connectionSlug: string): Promise<string | null> {
    const credential = await this.get({ type: 'llm_api_key', connectionSlug });
    return credential?.value ?? null;
  }

  async setLlmApiKey(connectionSlug: string, apiKey: string): Promise<void> {
    await this.set({ type: 'llm_api_key', connectionSlug }, { value: apiKey });
  }

  async deleteLlmApiKey(connectionSlug: string): Promise<boolean> {
    return this.delete({ type: 'llm_api_key', connectionSlug });
  }

  async deleteLlmCredentials(connectionSlug: string): Promise<void> {
    await this.deleteLlmApiKey(connectionSlug);
  }

  async hasLlmCredentials(connectionSlug: string, authType: LlmAuthType): Promise<boolean> {
    if (authType === 'none') return true;
    return Boolean(await this.getLlmApiKey(connectionSlug));
  }

  async checkHealth(): Promise<CredentialHealthStatus> {
    const issues: CredentialHealthIssue[] = [];
    try {
      await this.list({});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lower = message.toLowerCase();
      issues.push({
        type: lower.includes('decrypt') || lower.includes('cipher')
          ? 'decryption_failed'
          : 'file_corrupted',
        message: 'Failed to read encrypted credentials. Please enter the API key again.',
        error: message,
      });
      return { healthy: false, issues };
    }

    try {
      const { getDefaultLlmConnection, getLlmConnection } = await import('../config/storage.ts');
      const slug = getDefaultLlmConnection();
      const connection = slug ? getLlmConnection(slug) : undefined;
      if (slug && connection && !(await this.hasLlmCredentials(slug, connection.authType))) {
        issues.push({
          type: 'no_default_credentials',
          message: `No credentials found for default connection "${connection.name}".`,
        });
      }
    } catch {
      debug('[CredentialManager] Skipping default connection check - config not available');
    }

    return { healthy: issues.length === 0, issues };
  }
}

let manager: CredentialManager | null = null;

export function getCredentialManager(): CredentialManager {
  manager ??= new CredentialManager();
  return manager;
}
