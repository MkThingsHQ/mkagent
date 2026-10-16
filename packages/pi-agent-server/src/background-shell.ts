import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentEvent } from '@mkagent/core/types';
import type { AgentToolResult } from '@earendil-works/pi-coding-agent';

type Result = AgentToolResult<unknown>;
type Execute = (signal: AbortSignal, update: (result: Result) => void) => Promise<Result>;

/** Owns only commands launched by this Pi subprocess. Permission checking happens before start. */
export class BackgroundShells {
  private tasks = new Map<string, { controller: AbortController; done: Promise<void> }>();

  constructor(private emit: (event: AgentEvent) => void) {}

  start(options: { directory: string; toolUseId: string; command: string; execute: Execute }): Result {
    const taskId = `shell-${randomUUID()}`;
    mkdirSync(options.directory, { recursive: true });
    const outputFile = join(options.directory, `${taskId}.output`);
    writeFileSync(outputFile, '');
    const controller = new AbortController();
    const update = (result: Result) => {
      const text = result.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
      writeFileSync(outputFile, text);
    };
    // Defer execution until the task is registered and the launch event reaches the host.
    const done = Promise.resolve().then(async () => {
      let status: 'completed' | 'failed' | 'stopped' = 'completed';
      try {
        const result = await options.execute(controller.signal, update);
        update(result);
        if (result.isError) status = 'failed';
      } catch (error) {
        status = 'failed';
        if (!controller.signal.aborted) update({ content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], details: undefined });
      } finally {
        if (controller.signal.aborted) status = 'stopped';
        this.tasks.delete(taskId);
        this.emit({ type: 'task_completed', taskId, toolUseId: options.toolUseId, status, outputFile, launchedHere: true });
      }
    });
    this.tasks.set(taskId, { controller, done });
    this.emit({ type: 'shell_backgrounded', shellId: taskId, toolUseId: options.toolUseId, command: options.command });
    return { content: [{ type: 'text', text: `Command running in background with ID: ${taskId}. Output is being written to: ${outputFile}. You will be notified when it completes.` }], details: undefined };
  }

  async stop(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.controller.abort();
    await task.done;
    return true;
  }

  async dispose(): Promise<void> {
    const tasks = [...this.tasks.values()];
    for (const task of tasks) task.controller.abort();
    await Promise.all(tasks.map(task => task.done));
  }
}
