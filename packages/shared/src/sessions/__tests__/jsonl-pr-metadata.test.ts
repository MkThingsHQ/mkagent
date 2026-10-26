import { expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSessionHeader, readSessionHeader, readSessionHeaderAsync, writeSessionJsonl } from '../jsonl';
import type { StoredSession } from '../types';

it('reads PR pins and persistent feedback beyond an 8KB header, including multibyte boundaries', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pr-header-'));
  const session: StoredSession = { id: 's', workspaceRootPath: root, createdAt: 1, lastUsedAt: 1, name: '测试'.repeat(3000), codingMode: true,
    boundPrs: [{ host: 'github.com', owner: 'acme', repo: 'app', number: 7, addedAt: 1 }],
    prMonitors: { 'github.com/acme/app#7': { autoFix: true, lastFixSignature: Array.from({ length: 500 }, (_, i) => `t:thread-${i}:comment-${i}`) } },
    messages: [], tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextTokens: 0, costUsd: 0 } };
  try {
    const file = join(root, 'session.jsonl'); writeSessionJsonl(file, session);
    for (const header of [readSessionHeader(file), await readSessionHeaderAsync(file)]) {
      expect(header?.name).toBe(session.name); expect(header?.boundPrs).toEqual(session.boundPrs); expect(header?.prMonitors).toEqual(session.prMonitors);
    }
    session.messages = [{ id: 'hidden', type: 'user', content: 'system-notification internal notice', timestamp: 1, hidden: true }, { id: 'visible', type: 'user', content: 'Visible request', timestamp: 2 }];
    expect(createSessionHeader(session).preview).toBe('Visible request');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
