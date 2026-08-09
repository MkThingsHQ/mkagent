import { describe, expect, it } from 'bun:test';
import { shouldAllowToolInMode } from '../mode-manager.ts';
import { shouldPromptInAskMode, type PermissionManagerLike } from '../core/pre-tool-use.ts';
import {
  OPEN_CONNECTOR_PROXY_PREFIX,
  OPEN_CONNECTOR_READ_ONLY_PROXY_TOOL_NAMES,
} from '../../open-connector/agent-tools.ts';

describe('OpenConnector tool permissions', () => {
  const permissionManager: PermissionManagerLike = {
    isCommandWhitelisted: () => false,
    isDangerousCommand: () => false,
    getBaseCommand: command => command,
    extractDomainFromNetworkCommand: () => null,
    isDomainWhitelisted: () => false,
  };
  const permissionsContext = { workspaceRootPath: '/tmp/mkagent-open-connector-test' };

  it('allows discovery tools in Explore mode', () => {
    for (const toolName of OPEN_CONNECTOR_READ_ONLY_PROXY_TOOL_NAMES) {
      expect(shouldAllowToolInMode(toolName, {}, 'safe')).toEqual({ allowed: true });
    }
  });

  it('blocks execute_action in Explore mode', () => {
    const result = shouldAllowToolInMode(`${OPEN_CONNECTOR_PROXY_PREFIX}execute_action`, {}, 'safe');
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain('MCP write operations are blocked');
  });

  it('allows execute_action in Ask and Allow All modes for the prompt pipeline to gate', () => {
    const toolName = `${OPEN_CONNECTOR_PROXY_PREFIX}execute_action`;
    expect(shouldAllowToolInMode(toolName, {}, 'ask')).toEqual({ allowed: true });
    expect(shouldAllowToolInMode(toolName, {}, 'allow-all')).toEqual({ allowed: true });
  });

  it('scopes Ask-mode approval to the action and connection without exposing input values', () => {
    const prompt = shouldPromptInAskMode(
      `${OPEN_CONNECTOR_PROXY_PREFIX}execute_action`,
      {
        actionId: 'github.create_issue',
        connectionName: 'work',
        input: { title: 'sensitive title' },
      },
      permissionManager,
      permissionsContext,
    );
    expect(prompt).toMatchObject({
      promptType: 'network',
      command: `${OPEN_CONNECTOR_PROXY_PREFIX}execute_action:github.create_issue:work`,
    });
    expect(prompt?.description).toContain('github.create_issue')
    expect(prompt?.description).toContain('work')
    expect(prompt?.description).not.toContain('sensitive title')
  });
});
