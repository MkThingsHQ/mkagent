import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SESSION_MANAGER_URL = pathToFileURL(
  join(import.meta.dir, '../../../../../packages/server-core/src/sessions/SessionManager.ts'),
).href

describe('session branch rollback on preflight failure', () => {
  it('deletes the child session when Pi branch preflight fails', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'mkagent-branch-rollback-'))
    try {
      const script = `
        import { mkdirSync, writeFileSync } from 'node:fs';
        import { join } from 'node:path';
        import { SessionManager } from ${JSON.stringify(SESSION_MANAGER_URL)};
        import { createSession, listSessions, loadSession, saveSession } from '@mkagent/shared/sessions';

        const configDir = process.env.CONFIG_DIR;
        const workspaceRoot = join(configDir, 'workspaces', 'default');
        mkdirSync(workspaceRoot, { recursive: true });
        writeFileSync(join(workspaceRoot, 'config.json'), JSON.stringify({
          id: 'workspace-config', name: 'Default', slug: 'default', defaults: {},
          createdAt: Date.now(), updatedAt: Date.now(),
        }));
        writeFileSync(join(configDir, 'config.json'), JSON.stringify({
          workspaces: [{ id: 'workspace-default', name: 'Default', slug: 'default', rootPath: workspaceRoot, createdAt: Date.now() }],
          activeWorkspaceId: 'workspace-default', activeSessionId: null, llmConnections: [],
        }));

        const sourceConfig = await createSession(workspaceRoot, { name: 'Parent' });
        const source = loadSession(workspaceRoot, sourceConfig.id);
        source.sdkSessionId = 'pi-session-parent';
        source.messages = [
          { id: 'user-1', role: 'user', content: 'first', timestamp: 1 },
          { id: 'assistant-1', role: 'assistant', content: 'answer', timestamp: 2 },
        ];
        await saveSession(source);

        const manager = new SessionManager();
        await manager.initialize();
        let destroyed = false;
        manager.getOrCreateAgent = async (managed) => {
          managed.agent = {
            ensureBranchReady: async () => { throw new Error('preflight boom'); },
            destroy: () => { destroyed = true; },
          };
          return managed.agent;
        };

        let error = '';
        try {
          await manager.createSession('workspace-default', {
            branchFromSessionId: source.id,
            branchFromMessageId: 'assistant-1',
          });
        } catch (caught) {
          error = caught instanceof Error ? caught.message : String(caught);
        }

        const result = {
          error,
          destroyed,
          storedIds: listSessions(workspaceRoot).map(session => session.id),
          runtimeIds: [...manager.sessions.keys()],
        };
        manager.cleanup();
        console.log(JSON.stringify(result));
      `
      const run = Bun.spawnSync([process.execPath, '--eval', script], {
        cwd: join(import.meta.dir, '../../../../..'),
        env: { ...process.env, CONFIG_DIR: configDir },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      expect(run.exitCode, run.stderr.toString()).toBe(0)
      const result = JSON.parse(run.stdout.toString())
      expect(result.error).toBe('Could not create branch: preflight boom')
      expect(result.destroyed).toBe(true)
      expect(result.storedIds).toHaveLength(1)
      expect(result.runtimeIds).toHaveLength(1)
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })
})
