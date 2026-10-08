import { describe, expect, it } from 'bun:test'
import { createPendingPlanDispatcher, type PendingPlanExecution } from '../pending-plan-dispatch'

const ready: PendingPlanExecution = { planPath: '/plan.md', draftInputSnapshot: 'Keep this', awaitingCompaction: false, executionDispatched: false }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

describe('persisted plan dispatch', () => {
  it('waits for idle and persisted success; failure/awaiting cannot execute', async () => {
    let busy = true
    let pending: PendingPlanExecution | null = ready
    let claims = 0
    let sends = 0
    const dispatcher = createPendingPlanDispatcher({
      isBusy: () => busy, load: async () => pending, claim: async () => { claims++; return true }, submit: () => { sends++ }, clear: async () => {},
    })
    await dispatcher.request()
    expect(claims).toBe(0)
    busy = false
    pending = { ...ready, awaitingCompaction: true }
    await dispatcher.request()
    pending = null // host cleared a failed manual compaction
    await dispatcher.request()
    expect(sends).toBe(0)
    pending = ready
    await dispatcher.request()
    expect(sends).toBe(1)
  })
  it('requires claim === true; duplicate listeners and reloads send once', async () => {
    let claimed = false
    const sent: PendingPlanExecution[] = []
    const dependencies = {
      isBusy: () => false, load: async () => ready,
      claim: async () => { if (claimed) return false; claimed = true; return true },
      submit: (pending: PendingPlanExecution) => { sent.push(pending) }, clear: async () => {},
    }
    const first = createPendingPlanDispatcher(dependencies)
    const second = createPendingPlanDispatcher(dependencies)
    await Promise.all([first.request(), second.request(), first.request()])
    await createPendingPlanDispatcher(dependencies).request()
    expect(sent).toEqual([ready])
  })
  it('does not accept a legacy void claim as ownership', async () => {
    let sends = 0
    const dispatcher = createPendingPlanDispatcher({ isBusy: () => false, load: async () => ready, claim: async () => undefined, submit: () => { sends++ }, clear: async () => {} })
    await dispatcher.request()
    expect(sends).toBe(0)
  })
  it('rechecks busy after loading; disposal cancels an unclaimed read', async () => {
    const read = deferred<PendingPlanExecution | null>()
    let claims = 0
    const dispatcher = createPendingPlanDispatcher({ isBusy: () => false, load: () => read.promise, claim: async () => { claims++; return true }, submit: () => {}, clear: async () => {} })
    const running = dispatcher.request()
    dispatcher.dispose()
    read.resolve(ready)
    await running
    expect(claims).toBe(0)
  })
  it('finishes an already accepted claim even if its listener is disposed', async () => {
    const claim = deferred<boolean>()
    let sends = 0
    const dispatcher = createPendingPlanDispatcher({ isBusy: () => false, load: async () => ready, claim: () => claim.promise, submit: () => { sends++ }, clear: async () => {} })
    const running = dispatcher.request()
    await Promise.resolve()
    dispatcher.dispose()
    claim.resolve(true)
    await running
    expect(sends).toBe(1)
  })
})
