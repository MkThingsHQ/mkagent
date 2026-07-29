import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SESSION_MANAGER_URL = pathToFileURL(join(import.meta.dir, 'SessionManager.ts')).href

describe('SessionManager branching', () => {
  it('copies transcript and Pi resume metadata through the selected message', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'mkagent-session-branch-'))
    try {
      const script = `
        import { mkdirSync, writeFileSync } from 'node:fs';
        import { join } from 'node:path';
        import { SessionManager, savePiTurnAnchor, loadPiTurnAnchors } from ${JSON.stringify(SESSION_MANAGER_URL)};
        import { createSession, getSessionPath, loadSession, saveSession } from '@mkagent/shared/sessions';

        const configDir = process.env.MKAGENT_CONFIG_DIR;
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
        source.sdkCwd = '/tmp/pi-parent';
        source.messages = [
          { id: 'user-1', role: 'user', content: 'first', timestamp: 1 },
          { id: 'assistant-1', role: 'assistant', content: 'answer', timestamp: 2 },
          { id: 'user-2', role: 'user', content: 'later', timestamp: 3 },
        ];
        await saveSession(source);
        await savePiTurnAnchor(getSessionPath(workspaceRoot, source.id), 'assistant-1', 'pi-entry-1');

        const manager = new SessionManager();
        await manager.initialize();
        manager.getOrCreateAgent = async (managed) => {
          managed.agent = { ensureBranchReady: async () => {}, destroy: () => {} };
          return managed.agent;
        };
        const branch = await manager.createSession('workspace-default', {
          branchFromSessionId: source.id,
          branchFromMessageId: 'assistant-1',
        });
        const storedBranch = loadSession(workspaceRoot, branch.id);
        const anchors = await loadPiTurnAnchors(getSessionPath(workspaceRoot, branch.id));
        console.log(JSON.stringify({ branch, storedBranch, anchors }));
        manager.cleanup();
      `
      const run = Bun.spawnSync([process.execPath, '--eval', script], {
        cwd: join(import.meta.dir, '..', '..', '..'),
        env: { ...process.env, MKAGENT_CONFIG_DIR: configDir },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      expect(run.exitCode, run.stderr.toString()).toBe(0)
      const { branch, storedBranch, anchors } = JSON.parse(run.stdout.toString())
      expect(branch.messages.map((message: { id: string }) => message.id)).toEqual(['user-1', 'assistant-1'])
      expect(storedBranch.branchFromMessageId).toBe('assistant-1')
      expect(storedBranch.branchFromSdkSessionId).toBe('pi-session-parent')
      expect(storedBranch.branchFromSdkCwd).toBe('/tmp/pi-parent')
      expect(storedBranch.branchFromSdkTurnId).toBe('pi-entry-1')
      expect(anchors.anchors).toEqual({ 'assistant-1': 'pi-entry-1' })
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })
})
