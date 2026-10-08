import { afterEach, describe, expect, it } from 'bun:test';
import { PiAgent } from '../pi-agent.ts';
import { AbortReason } from '../backend/types.ts';

const agents: PiAgent[] = [];
function makeAgent(): any {
  const agent = new PiAgent({
    provider: 'pi', isHeadless: true,
    workspace: { id: 'pi-compact-test', name: 'Test', rootPath: '/tmp/pi-compact-test' } as any,
  });
  agents.push(agent);
  (agent as any).ensureSubprocess = async () => {};
  return agent;
}
afterEach(() => { for (const agent of agents.splice(0)) agent.destroy(); });
async function collect(stream: AsyncIterable<any>) {
  const events: any[] = [];
  for await (const event of stream) events.push(event);
  return events;
}
const result = {
  summary: 'summary', firstKeptEntryId: 'kept', tokensBefore: 419_000,
  estimatedTokensAfter: 12_000,
  contextUsage: { tokens: null, contextWindow: 500_000 },
  compactionSettings: { enabled: true, reserveTokens: 31_000 },
};

describe('Pi manual compaction RPC', () => {
  it('waits for real completion then emits fresh occupancy, one manual success, complete', async () => {
    const agent = makeAgent();
    let finish!: () => void;
    const ready = new Promise<void>(resolve => {
      agent.send = (msg: any) => {
        if (msg.type !== 'compact') return;
        // SDK emits its manual end first; the RPC generator owns notification.
        agent.handleSubprocessEvent({ type: 'compaction_end', reason: 'manual', result, aborted: false });
        finish = () => agent.handleCompactResult({ type: 'compact_result', id: msg.id, success: true, result });
        resolve();
      };
    });
    const events: any[] = [];
    const done = (async () => { for await (const e of agent.chatImpl('/compact')) events.push(e); })();
    await ready;
    expect(events.some(e => e.type === 'info')).toBe(false);
    finish();
    await done;
    expect(events.map(e => e.type)).toEqual(['context_usage', 'info', 'complete']);
    expect(events[0].contextUsage).toMatchObject({ usedTokens: 12_000, limitTokens: 469_000 });
    expect(events[1].compactionTrigger).toBe('manual');
  });

  it('treats an empty successful response as failure, not successful plan acceptance', async () => {
    const agent = makeAgent();
    agent.send = (msg: any) => {
      if (msg.type === 'compact') agent.handleCompactResult({ id: msg.id, success: true });
    };
    const events = await collect(agent.chatImpl('/compact'));
    expect(events[0].type).toBe('compaction_failed');
    expect(events.some(e => e.type === 'info')).toBe(false);
    expect(events.at(-1).type).toBe('complete');
  });

  it('emits compaction_failed before an RPC error and completion', async () => {
    const agent = makeAgent();
    agent.send = (msg: any) => {
      if (msg.type === 'compact') agent.handleCompactResult({ id: msg.id, success: false, errorMessage: 'Summary failed' });
    };
    const events = await collect(agent.chatImpl('/compact'));
    expect(events.map(e => e.type)).toEqual(['compaction_failed', 'error', 'complete']);
  });

  it('host timeout cancels the child compaction and reports the failure (#1060)', async () => {
    const agent = makeAgent();
    agent.compactTimeoutMs = 20;
    const sent: any[] = [];
    agent.send = (msg: any) => { sent.push(msg); };
    const events = await collect(agent.chatImpl('/compact'));
    // The deadline both rejects locally and tells the subprocess to abort.
    expect(sent.map((m) => m.type)).toEqual(['compact', 'abort']);
    expect(agent.pendingCompactions.size).toBe(0);
    expect(events.map((e) => e.type)).toEqual(['compaction_failed', 'error', 'complete']);
    expect(events[1].message).toContain('timed out');
    expect(events[1].message).toContain('cancelled');
    // A late success from the child no longer has a pending request to land on.
    agent.handleCompactResult({ id: sent[0].id, success: true, result });
    expect(agent.pendingCompactions.size).toBe(0);
  });

  it('refuses to steer while a manual compaction owns the turn and reports it in flight (#1058)', async () => {
    const agent = makeAgent();
    const sent: any[] = [];
    let requestId!: string;
    let ready!: () => void;
    const started = new Promise<void>((resolve) => { ready = resolve; });
    agent.send = (msg: any) => { sent.push(msg); if (msg.type === 'compact') { requestId = msg.id; ready(); } };
    expect(agent.isCompactionInFlight()).toBe(false);
    const done = collect(agent.chatImpl('/compact'));
    await started;
    expect(agent.isCompactionInFlight()).toBe(true);

    expect(agent.redirect('follow-up question')).toBe(false);
    // No steer was sent into a turn with no agent loop, and the compaction was not aborted.
    expect(sent.map((m) => m.type)).toEqual(['compact']);
    expect(agent.pendingCompactions.size).toBe(1);

    agent.handleSubprocessEvent({ type: 'compaction_end', reason: 'manual', result, aborted: false });
    agent.handleCompactResult({ id: requestId, success: true, result });
    const events = await done;
    expect(events.at(-1).type).toBe('complete');
    expect(agent.isCompactionInFlight()).toBe(false);
  });

  it.each(['abort', 'forceAbort', 'destroy'])('cancels pending manual RPC on %s and ignores its late success', async (method) => {
    const agent = makeAgent();
    let requestId!: string;
    let ready!: () => void;
    const sent = new Promise<void>(resolve => { ready = resolve; });
    agent.send = (msg: any) => { if (msg.type === 'compact') { requestId = msg.id; ready(); } };
    const done = collect(agent.chatImpl('/compact'));
    await sent;
    if (method === 'forceAbort') agent.forceAbort(AbortReason.UserStop);
    else await agent[method]();
    expect(agent.pendingCompactions.size).toBe(0);
    agent.handleCompactResult({ id: requestId, success: true, result });
    const events = await done;
    expect(events[0].type).toBe('compaction_failed');
    expect(events.some(e => e.type === 'info' || e.type === 'context_usage')).toBe(false);
  });
});
