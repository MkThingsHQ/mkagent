export type CredentialInputMode = 'bearer' | 'basic' | 'header' | 'query' | 'multi-header';

export type GoogleService = 'gmail' | 'calendar' | 'drive' | 'docs' | 'sheets' | 'youtube' | 'searchconsole';
export type SlackService = 'messaging' | 'channels' | 'users' | 'files' | 'full';
export type MicrosoftService = 'outlook' | 'microsoft-calendar' | 'onedrive' | 'teams' | 'sharepoint';

export type AuthRequestType =
  | 'credential'
  | 'oauth'
  | 'oauth-google'
  | 'oauth-slack'
  | 'oauth-microsoft';

export interface BaseAuthRequest {
  requestId: string;
  sessionId: string;
  sourceSlug: string;
  sourceName: string;
}

export interface CredentialAuthRequest extends BaseAuthRequest {
  type: 'credential';
  mode: CredentialInputMode;
  labels?: { credential?: string; username?: string; password?: string };
  description?: string;
  hint?: string;
  headerName?: string;
  headerNames?: string[];
  sourceUrl?: string;
  passwordRequired?: boolean;
}

export interface McpOAuthAuthRequest extends BaseAuthRequest {
  type: 'oauth';
}

export interface GoogleOAuthAuthRequest extends BaseAuthRequest {
  type: 'oauth-google';
  service?: GoogleService;
}

export interface SlackOAuthAuthRequest extends BaseAuthRequest {
  type: 'oauth-slack';
  service?: SlackService;
}

export interface MicrosoftOAuthAuthRequest extends BaseAuthRequest {
  type: 'oauth-microsoft';
  service?: MicrosoftService;
}

export type AuthRequest =
  | CredentialAuthRequest
  | McpOAuthAuthRequest
  | GoogleOAuthAuthRequest
  | SlackOAuthAuthRequest
  | MicrosoftOAuthAuthRequest;

export interface AuthResult {
  requestId: string;
  sourceSlug: string;
  success: boolean;
  cancelled?: boolean;
  error?: string;
  email?: string;
  workspace?: string;
}

export type SourceType = 'mcp' | 'api' | 'local';
export type McpTransport = 'http' | 'sse' | 'stdio';
export type McpAuthType = 'oauth' | 'bearer' | 'none';
export type ApiAuthType = 'bearer' | 'header' | 'query' | 'basic' | 'oauth' | 'none';

export interface McpSourceConfig {
  transport?: McpTransport;
  url?: string;
  authType?: McpAuthType;
  clientId?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  headerNames?: string[];
}

export interface ApiSourceConfig {
  baseUrl: string;
  authType: ApiAuthType;
  headerName?: string;
  headerNames?: string[];
  queryParam?: string;
  authScheme?: string;
  testEndpoint?: {
    method: 'GET' | 'POST';
    path: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  };
  googleService?: GoogleService;
  googleScopes?: string[];
  googleOAuthClientId?: string;
  googleOAuthClientSecret?: string;
  slackService?: SlackService;
  microsoftService?: MicrosoftService;
  oauth?: {
    authorizationUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret?: string;
    scopes?: string[];
    audience?: string;
    extraParams?: Record<string, string>;
  };
}

export interface LocalSourceConfig {
  path: string;
  format?: string;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'unknown';

export interface SourceConfig {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  provider: string;
  type: SourceType;
  mcp?: McpSourceConfig;
  api?: ApiSourceConfig;
  local?: LocalSourceConfig;
  isAuthenticated?: boolean;
  lastTestedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  tagline?: string;
  icon?: string;
  connectionStatus?: ConnectionStatus;
  connectionError?: string;
}

export interface DeveloperFeedback {
  id: string;
  timestamp: string;
  sessionId: string;
  message: string;
}

export interface CallbackMessage {
  __callback__: string;
  [key: string]: unknown;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: TextContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface ValidationIssue {
  path: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
