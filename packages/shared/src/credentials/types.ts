/** Credential storage types for model connections and workspace Sources. */

export type CredentialType =
  | 'claude_oauth'
  | 'llm_api_key'
  | 'llm_oauth'
  | 'workspace_oauth'
  | 'source_oauth'
  | 'source_bearer'
  | 'source_apikey'
  | 'source_basic';

const VALID_CREDENTIAL_TYPES: readonly CredentialType[] = [
  'claude_oauth',
  'llm_api_key',
  'llm_oauth',
  'workspace_oauth',
  'source_oauth',
  'source_bearer',
  'source_apikey',
  'source_basic',
];

export const SOURCE_CREDENTIAL_TYPES = [
  'source_oauth',
  'source_bearer',
  'source_apikey',
  'source_basic',
] as const;

const CREDENTIAL_DELIMITER = '::';

export interface CredentialId {
  type: CredentialType;
  connectionSlug?: string;
  workspaceId?: string;
  sourceId?: string;
}

export interface StoredCredential {
  value: string;
  refreshToken?: string;
  expiresAt?: number;
  clientId?: string;
  clientSecret?: string;
  tokenType?: string;
  source?: 'native' | 'cli';
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
  if (id.type === 'claude_oauth') {
    return [id.type, 'global'].join(CREDENTIAL_DELIMITER);
  }

  if ((id.type === 'llm_api_key' || id.type === 'llm_oauth') && id.connectionSlug) {
    return [id.type, id.connectionSlug].join(CREDENTIAL_DELIMITER);
  }

  if (id.type === 'workspace_oauth' && id.workspaceId) {
    return [id.type, id.workspaceId].join(CREDENTIAL_DELIMITER);
  }

  if ((SOURCE_CREDENTIAL_TYPES as readonly string[]).includes(id.type) && id.workspaceId && id.sourceId) {
    return [id.type, id.workspaceId, id.sourceId].join(CREDENTIAL_DELIMITER);
  }

  throw new Error(`Invalid credential identifier for ${id.type}`);
}

export function accountToCredentialId(account: string): CredentialId | null {
  const parts = account.split(CREDENTIAL_DELIMITER);
  const type = parts[0];
  if (!type || !VALID_CREDENTIAL_TYPES.includes(type as CredentialType)) return null;

  if (type === 'claude_oauth' && parts.length === 2 && parts[1] === 'global') {
    return { type };
  }

  if ((type === 'llm_api_key' || type === 'llm_oauth') && parts.length === 2 && parts[1]) {
    return { type, connectionSlug: parts[1] };
  }

  if (type === 'workspace_oauth' && parts.length === 2 && parts[1]) {
    return { type, workspaceId: parts[1] };
  }

  if (
    (SOURCE_CREDENTIAL_TYPES as readonly string[]).includes(type)
    && parts.length === 3
    && parts[1]
    && parts[2]
  ) {
    return { type: type as CredentialType, workspaceId: parts[1], sourceId: parts[2] };
  }

  return null;
}
