import { describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const STORAGE_URL = pathToFileURL(join(import.meta.dir, '..', 'storage.ts')).href;

describe('ensureDefaultWorkspace', () => {
  it('creates an idempotent default workspace with sessions and Skills directories', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'mkagent-default-workspace-'));
    try {
      const script = `
        import { ensureDefaultWorkspace } from ${JSON.stringify(STORAGE_URL)};
        const first = ensureDefaultWorkspace();
        const second = ensureDefaultWorkspace();
        console.log(JSON.stringify({ first, second }));
      `;
      const run = Bun.spawnSync([process.execPath, '--eval', script], {
        env: { ...process.env, MKAGENT_CONFIG_DIR: configDir },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(run.exitCode).toBe(0);
      const { first, second } = JSON.parse(run.stdout.toString());
      const root = join(configDir, 'workspaces', 'default');
      expect(first.slug).toBe('default');
      expect(second.id).toBe(first.id);
      expect(existsSync(join(root, 'sessions'))).toBe(true);
      expect(existsSync(join(root, 'skills'))).toBe(true);
      expect(JSON.parse(readFileSync(join(root, 'config.json'), 'utf-8')).slug).toBe('default');
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
  });
});
