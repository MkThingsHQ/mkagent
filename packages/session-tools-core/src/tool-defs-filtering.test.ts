import { describe, it, expect } from 'bun:test';
import {
  SESSION_TOOL_DEFS,
  getSessionToolDefs,
  getSessionToolNames,
  getSessionToolRegistry,
  getSessionSafeAllowedToolNames,
  getSessionSafeBlockedToolNames,
  getToolDefsAsJsonSchema,
  CODING_PROFILE_TOOLS,
} from './tool-defs.ts';

describe('session tool filtering helpers', () => {
  it('excludes developer feedback tool when includeDeveloperFeedback is false', () => {
    const defs = getSessionToolDefs({ includeDeveloperFeedback: false });
    const names = defs.map(d => d.name);

    expect(names.includes('send_developer_feedback')).toBe(false);
  });

  it('includes developer feedback tool when includeDeveloperFeedback is true', () => {
    const defs = getSessionToolDefs({ includeDeveloperFeedback: true });
    const names = defs.map(d => d.name);

    expect(names.includes('send_developer_feedback')).toBe(true);
  });

  it('name set and registry stay aligned for filtered output', () => {
    const names = getSessionToolNames({ includeDeveloperFeedback: false });
    const registry = getSessionToolRegistry({ includeDeveloperFeedback: false });

    expect(registry.has('send_developer_feedback')).toBe(false);
    expect(names.has('send_developer_feedback')).toBe(false);

    for (const name of names) {
      expect(registry.has(name)).toBe(true);
    }
  });

  it('json schema conversion respects includeDeveloperFeedback filter', () => {
    const defs = getToolDefsAsJsonSchema({ includeDeveloperFeedback: false });
    const names = defs.map(d => d.name);

    expect(names.includes('send_developer_feedback')).toBe(false);
  });

  it('all canonical session tools declare safeMode metadata', () => {
    for (const def of SESSION_TOOL_DEFS) {
      expect(def.safeMode === 'allow' || def.safeMode === 'block').toBe(true);
    }
  });

  it('safe-mode helper sets classify expected tools', () => {
    const allowed = getSessionSafeAllowedToolNames();
    const blocked = getSessionSafeBlockedToolNames();

    expect(allowed.has('send_developer_feedback')).toBe(true);
    expect(allowed.has('call_llm')).toBe(true);
    expect(allowed.has('browser_tool')).toBe(true);
    expect(allowed.has('script_sandbox')).toBe(true);

    expect(blocked.has('spawn_session')).toBe(true);
    expect(blocked.has('update_user_preferences')).toBe(true);
  });

  it('safe-mode helpers support MCP prefixing', () => {
    const allowedPrefixed = getSessionSafeAllowedToolNames({ prefix: 'mcp__session__' });
    const blockedPrefixed = getSessionSafeBlockedToolNames({ prefix: 'mcp__session__' });

    expect(allowedPrefixed.has('mcp__session__send_developer_feedback')).toBe(true);
    expect(allowedPrefixed.has('mcp__session__call_llm')).toBe(true);
    expect(allowedPrefixed.has('mcp__session__script_sandbox')).toBe(true);
    expect(blockedPrefixed.has('mcp__session__spawn_session')).toBe(true);
    expect(blockedPrefixed.has('mcp__session__update_user_preferences')).toBe(true);
  });

  describe('agent profile', () => {
    const names = (options?: Parameters<typeof getSessionToolDefs>[0]) => getSessionToolDefs(options).map(d => d.name);

    it('leaves the default tool set unchanged', () => {
      expect(names({ profile: 'default' })).toEqual(names());
    });

    it('keeps only the always-on coding tools in a bare coding session', () => {
      expect(names({ profile: 'coding' })).toEqual(['SubmitPlan', 'send_developer_feedback', 'list_background_tasks']);
      expect(names({ profile: 'coding', includeDeveloperFeedback: false })).toEqual(['SubmitPlan', 'list_background_tasks']);
    });

    it('keeps excluded Sources and project tools out of the coding allowlist', () => {
      expect(Object.keys(CODING_PROFILE_TOOLS)).not.toContain('source_test');
      expect(Object.keys(CODING_PROFILE_TOOLS)).not.toContain('project_memory_append');
    });

    it('drops desktop-workflow tools even when their own flags are on', () => {
      const coding = names({ profile: 'coding', includeBrowser: true });
      for (const dropped of ['browser_tool', 'create_page', 'set_session_labels', 'spawn_session', 'call_llm', 'decide', 'transform_data', 'update_user_preferences']) {
        expect(coding).not.toContain(dropped);
      }
      expect(coding.every(name => name in CODING_PROFILE_TOOLS)).toBe(true);
    });

    it('lists only tools that exist in the registry', () => {
      const registered = new Set(SESSION_TOOL_DEFS.map(d => d.name));
      expect(Object.keys(CODING_PROFILE_TOOLS).filter(name => !registered.has(name))).toEqual([]);
    });

    it('applies the same filter to the JSON Schema view (Pi)', () => {
      const pi = getToolDefsAsJsonSchema({ prefix: 'mcp__session__', profile: 'coding' }).map(d => d.name);
      expect(pi).toEqual(['mcp__session__SubmitPlan', 'mcp__session__send_developer_feedback', 'mcp__session__list_background_tasks']);
    });
  });

  it('hides browser_tool when includeBrowser is false', () => {
    expect(getSessionToolDefs().some(d => d.name === 'browser_tool')).toBe(true);
    expect(getSessionToolDefs({ includeBrowser: false }).some(d => d.name === 'browser_tool')).toBe(false);
  });
});
