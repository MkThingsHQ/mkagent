import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createNodeFileSystem,
  type AuthRequest,
  type CredentialManagerInterface,
  type HttpMcpConfig,
  type LoadedSource,
  type McpValidationResult,
  type SessionToolContext,
  type SourceConfig,
  type StdioMcpConfig,
  type StdioValidationResult,
} from '@mkagent/session-tools-core';
import {
  validateAll,
  validateAllSources,
  validateAllPermissions,
  validateConfig,
  validatePreferences,
  validateSource,
  validateSkill,
  validateToolIcons,
} from '../config/validators.ts';
import {
  downloadSourceIcon,
  loadSourceConfig,
  saveSourceConfig,
} from '../sources/storage.ts';
import {
  inferGoogleServiceFromUrl,
  inferMicrosoftServiceFromUrl,
  inferSlackServiceFromUrl,
  type FolderSourceConfig,
  type LoadedSource as SharedLoadedSource,
} from '../sources/types.ts';
import { getSourceCredentialManager } from '../sources/credential-manager.ts';
import { isGoogleOAuthConfigured } from '../auth/google-oauth.ts';
import {
  validateMcpConnection as validateMcpConnectionImpl,
  validateStdioMcpConnection as validateStdioMcpConnectionImpl,
} from '../mcp/validation.ts';
import { isIconUrl } from '../utils/icon.ts';
import { updatePreferences } from '../config/preferences.ts';
import { getSessionDataPath, getSessionPath, getSessionPlansPath } from '../sessions/storage.ts';

export function createPiContext(options: {
  sessionId: string;
  workspacePath: string;
  workingDirectory?: string;
  onPlanSubmitted(planPath: string): void;
  onAuthRequest?(request: AuthRequest): void;
}): SessionToolContext {
  const sessionPath = getSessionPath(options.workspacePath, options.sessionId);
  const dataPath = getSessionDataPath(options.workspacePath, options.sessionId);
  mkdirSync(dataPath, { recursive: true });

  const toSharedSource = (source: LoadedSource): SharedLoadedSource => ({
    config: source.config as unknown as FolderSourceConfig,
    guide: null,
    folderPath: source.folderPath,
    workspaceRootPath: source.workspaceRootPath,
    workspaceId: source.workspaceId,
  });
  const sourceCredentialManager = getSourceCredentialManager();
  const credentialManager: CredentialManagerInterface = {
    hasValidCredentials: source => sourceCredentialManager.hasValidCredentials(toSharedSource(source)),
    getToken: source => sourceCredentialManager.getToken(toSharedSource(source)),
    refresh: source => sourceCredentialManager.refresh(toSharedSource(source)),
  };

  const validateStdioMcpConnection = async (
    config: StdioMcpConfig,
  ): Promise<StdioValidationResult> => {
    try {
      const result = await validateStdioMcpConnectionImpl(config);
      return {
        success: result.success,
        error: result.error,
        toolCount: result.tools?.length,
        toolNames: result.tools,
        serverName: result.serverInfo?.name,
        serverVersion: result.serverInfo?.version,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  const validateMcpConnection = async (
    config: HttpMcpConfig,
  ): Promise<McpValidationResult> => {
    try {
      const result = await validateMcpConnectionImpl({
        mcpUrl: config.url,
        mcpTransport: config.transport,
        mcpHeaders: config.headers,
        mcpAccessToken: config.accessToken,
      });
      return {
        success: result.success,
        error: result.error,
        needsAuth: result.errorType === 'needs-auth',
        toolCount: result.tools?.length,
        toolNames: result.tools,
        serverName: result.serverInfo?.name,
        serverVersion: result.serverInfo?.version,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  return {
    sessionId: options.sessionId,
    workspacePath: options.workspacePath,
    sourcesPath: join(options.workspacePath, 'sources'),
    skillsPath: join(options.workspacePath, 'skills'),
    plansFolderPath: getSessionPlansPath(options.workspacePath, options.sessionId),
    workingDirectory: options.workingDirectory,
    callbacks: {
      onPlanSubmitted: options.onPlanSubmitted,
      onAuthRequest: options.onAuthRequest ?? (() => {}),
    },
    fs: createNodeFileSystem(),
    validators: {
      validateConfig,
      validateSource,
      validateAllSources,
      validatePreferences,
      validatePermissions: validateAllPermissions,
      validateToolIcons,
      validateAll: workspaceRootPath => validateAll(undefined, workspaceRootPath),
      validateSkill,
    },
    credentialManager,
    loadSourceConfig: sourceSlug =>
      loadSourceConfig(options.workspacePath, sourceSlug) as unknown as SourceConfig | null,
    saveSourceConfig: source =>
      saveSourceConfig(options.workspacePath, source as unknown as FolderSourceConfig),
    inferGoogleService: inferGoogleServiceFromUrl,
    inferSlackService: inferSlackServiceFromUrl,
    inferMicrosoftService: inferMicrosoftServiceFromUrl,
    isGoogleOAuthConfigured,
    isIconUrl,
    downloadSourceIcon: (sourceSlug, iconUrl) =>
      downloadSourceIcon(options.workspacePath, sourceSlug, iconUrl),
    validateStdioMcpConnection,
    validateMcpConnection,
    updatePreferences: updates => updatePreferences(updates),
    submitFeedback: feedback => {
      const feedbackPath = join(options.workspacePath, 'feedback');
      mkdirSync(feedbackPath, { recursive: true });
      writeFileSync(join(feedbackPath, `${feedback.id}.json`), JSON.stringify(feedback, null, 2));
    },
    sessionPath,
    dataPath,
  };
}
