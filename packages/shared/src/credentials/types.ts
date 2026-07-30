/** Credential storage types for model connections. */

export type CredentialType = 'llm_api_key' | 'llm_oauth';

const CREDENTIAL_DELIMITER = '::';

export interface CredentialId {
  type: CredentialType;
  connectionSlug: string;
}

export interface StoredCredential {
  value: string;
  refreshToken?: string;
  expiresAt?: number;
  idToken?: string;
}

export type CredentialHealthIssueType =
  | 'file_corrupted'
  | 'decryption_failed'
  | 'no_default_credentials';

export interface CredentialHealthIssue {
  type: CredentialHealthIssueType;
  message: string;
  error?: string;
}

export interface CredentialHealthStatus {
  healthy: boolean;
  issues: CredentialHealthIssue[];
}

export function credentialIdToAccount(id: CredentialId): string {
  return [id.type, id.connectionSlug].join(CREDENTIAL_DELIMITER);
}

export function accountToCredentialId(account: string): CredentialId | null {
  const [type, connectionSlug, ...rest] = account.split(CREDENTIAL_DELIMITER);
  if ((type !== 'llm_api_key' && type !== 'llm_oauth') || !connectionSlug || rest.length > 0) return null;
  return { type, connectionSlug };
}
