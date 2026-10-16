import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBashToolDefinition } from '@earendil-works/pi-coding-agent';
import type { AgentEvent } from '@mkagent/core/types';
import { BackgroundShells } from './background-shell';

const directories: string[] = [];
const registries: BackgroundShells[] = [];
afterEach(async () => {
  for (const registry of registries.splice(0)) await registry.dispose();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'mkagent task output '));
  directories.push(directory);
  const events: AgentEvent[] = [];
  const registry = new BackgroundShells(event => events.push(event));
  registries.push(registry);
  const tool = createBashToolDefinition(directory, { exposeSessionEnvironment: false });
  const start = (command: string) => registry.start({ directory, toolUseId: crypto.randomUUID(), command,
    execute: (signal, update) => tool.execute('test', { command }, signal, update, undefined as never),
  });
  return { registry, events, start };
}

async function eventually(check: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Background shell condition timed out');
    await Bun.sleep(20);
  }
}

const launchedId = (events: AgentEvent[]) => {
  const event = events.findLast(event => event.type === 'shell_backgrounded');
  if (!event || event.type !== 'shell_backgrounded') throw new Error('No shell launch');
  return event.shellId;
};

describe('Pi background shell ownership and live output', () => {
  it('returns before a command exits and exposes its live output in a path with spaces', async () => {
    const { registry, events, start } = fixture();
    const launch = start('echo live-output; sleep 30');
    const id = launchedId(events);
    const text = launch.content[0];
    expect(text.type).toBe('text');
    const output = text.type === 'text' ? text.text.match(/Output is being written to: (.+)\. You will/)?.[1] : undefined;
    expect(output).toBeDefined();
    await eventually(() => readFileSync(output!, 'utf8').includes('live-output'));
    expect(await registry.stop(id)).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ type: 'task_completed', taskId: id, status: 'stopped' }));
    expect(await registry.stop(id)).toBe(false);
  });

  it('stops only the requested task when two commands are identical', async () => {
    const { registry, events, start } = fixture();
    start('sleep 30');
    const first = launchedId(events);
    start('sleep 30');
    const second = launchedId(events);
    expect(await registry.stop(first)).toBe(true);
    expect(events.some(event => event.type === 'task_completed' && event.taskId === second)).toBe(false);
    expect(await registry.stop(second)).toBe(true);
  });

  it('preserves a command failure and its output', async () => {
    const { events, start } = fixture();
    start('echo expected-failure; exit 7');
    await eventually(() => events.some(event => event.type === 'task_completed'));
    const event = events.find(event => event.type === 'task_completed');
    expect(event).toMatchObject({ status: 'failed' });
    if (event?.type === 'task_completed') expect(readFileSync(event.outputFile!, 'utf8')).toContain('expected-failure');
  });
});
