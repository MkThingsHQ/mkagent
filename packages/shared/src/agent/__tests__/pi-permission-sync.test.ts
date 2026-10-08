import { afterEach, describe, expect, it } from 'bun:test';
import { PiAgent } from '../pi-agent.ts';
import { validateBashCommand } from '../bash-validator.ts';

const agents: PiAgent[] = [];
afterEach(() => { for (const agent of agents.splice(0)) agent.destroy(); });

function makeAgent() {
  const agent = new PiAgent({
    provider: 'pi', isHeadless: true, skipConfigWatcher: true,
    workspace: { id: 'permission-sync', name: 'Test', rootPath: '/tmp/permission-sync', slug: 'permission-sync', createdAt: Date.now() },
    session: { id: `permission-${agents.length}`, workspaceRootPath: '/tmp/permission-sync', createdAt: Date.now(), lastUsedAt: Date.now() },
  });
  agents.push(agent);
  agent.setPermissionMode('ask');
  const responses: any[] = [];
  (agent as any).send = (message: any) => responses.push(message);
  const run = async (command: string) => {
    await (agent as any).handlePreToolUseRequest({ requestId: command, toolName: 'Bash', input: { command } });
    return responses.at(-1);
  };
  return { agent, run };
}

describe('Pi permission sync', () => {
  it('remembers an approved subcommand without allowing a destructive command or chain', async () => {
    const { agent, run } = makeAgent();
    const prompts: any[] = [];
    agent.onPermissionRequest = request => {
      prompts.push(request);
      agent.respondToPermission(request.requestId, prompts.length === 1, true);
    };
    expect((await run('git commit -m first')).action).toBe('allow');
    expect(prompts[0].canAlwaysAllow).toBe(true);
    expect((await run('git commit -m second')).action).toBe('allow');
    expect(prompts).toHaveLength(1);
    expect((await run('git push --force')).action).toBe('block');
    expect(prompts[1].canAlwaysAllow).toBe(false);
    expect((await run('git commit -m third && rm -rf /tmp/test')).action).toBe('block');
    expect(prompts[2].canAlwaysAllow).toBe(false);
  });

  it('denies a required prompt when no permission handler can answer it', async () => {
    const { run } = makeAgent();
    expect(await run('rm /tmp/test')).toMatchObject({ action: 'block', reason: expect.stringContaining('no permission handler') });
  });
});

describe('read-only Bash inspectors', () => {
  const permissiveLegacyPatterns = [{ regex: /.*/, source: 'default' as const, comment: 'Simulate an existing broad user allowlist' }];
  it.each(['gh api -X DELETE repos/o/r', 'gh api repos/o/r -f title=test', "sed -n -i 'p' file", "sed -n 'w file' input", 'sort -o output input'])('rejects writes even with a broad legacy pattern: %s', command => {
    expect(validateBashCommand(command, permissiveLegacyPatterns).allowed).toBe(false);
  });
  it.each(['gh api -X GET repos/o/r', "sed -n '1,5p' file", 'sort input'])('retains read-only invocation: %s', command => {
    expect(validateBashCommand(command, permissiveLegacyPatterns).allowed).toBe(true);
  });
});
