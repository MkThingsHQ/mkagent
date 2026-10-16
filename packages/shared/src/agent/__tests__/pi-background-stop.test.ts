import { afterEach, describe, expect, it } from 'bun:test';
import { PiAgent } from '../pi-agent';

const agents: PiAgent[] = [];
function makeAgent(): any {
  const agent = new PiAgent({ provider: 'pi', isHeadless: true,
    workspace: { id: 'stop-test', name: 'Test', rootPath: '/tmp/pi-background-stop-test' } as any });
  agents.push(agent);
  return agent;
}
afterEach(() => { for (const agent of agents.splice(0)) agent.destroy(); });

describe('Pi background stop delivery', () => {
  it('requires a live transport', async () => {
    await expect(makeAgent().stopBackgroundTask('live')).rejects.toThrow('transport unavailable');
  });
  it('rejects an unacknowledged request and ignores late acknowledgements', async () => {
    const agent = makeAgent();
    agent.subprocess = {};
    agent.backgroundStopTimeoutMs = 5;
    let request: any;
    agent.send = (message: any) => { request = message; };
    await expect(agent.stopBackgroundTask('live')).rejects.toThrow('timed out');
    expect(agent.pendingBackgroundStops.size).toBe(0);
    agent.handleLine(JSON.stringify({ type: 'stop_background_task_result', id: request.id, stopped: true }));
    agent.subprocess = null;
  });
  it('reserves false for an acknowledged task that is no longer running', async () => {
    const agent = makeAgent();
    agent.subprocess = {};
    agent.send = (message: any) => agent.handleLine(JSON.stringify({
      type: 'stop_background_task_result', id: message.id, stopped: false,
    }));
    expect(await agent.stopBackgroundTask('done')).toBe(false);
    agent.subprocess = null;
  });
});
