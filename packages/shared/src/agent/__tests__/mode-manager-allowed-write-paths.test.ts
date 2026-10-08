import { describe, it, expect } from 'bun:test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { matchesAllowedWritePath } from '../../agent/mode-manager.ts';

// The matcher is shared by Explore mode (shouldAllowToolInMode) and Ask mode
// (core/pre-tool-use.ts:shouldPromptInAskMode) since OSS #1065; both modes must
// agree on what "inside the allowlist" means.
describe('matchesAllowedWritePath', () => {
  it('matches nested paths under a /** glob', () => {
    expect(matchesAllowedWritePath('/tmp/out/a/b.txt', ['/tmp/out/**'])).toBe(true);
    expect(matchesAllowedWritePath('/tmp/out/a.txt', ['/tmp/out/**'])).toBe(true);
  });

  it('does not match a sibling directory that shares the prefix', () => {
    expect(matchesAllowedWritePath('/tmp/output/a.txt', ['/tmp/out/**'])).toBe(false);
  });

  it('expands ~ in patterns', () => {
    expect(matchesAllowedWritePath(join(homedir(), '.mkagent', 'x.json'), ['~/.mkagent/**'])).toBe(true);
  });

  it('checks every pattern and ignores invalid ones', () => {
    expect(matchesAllowedWritePath('/srv/site/index.html', ['/tmp/**', '/srv/site/**'])).toBe(true);
    expect(matchesAllowedWritePath('/srv/site/index.html', ['/tmp/**'])).toBe(false);
    expect(matchesAllowedWritePath('/srv/site/index.html', [])).toBe(false);
  });
});
