export interface PendingPlanExecution {
  planPath: string
  draftInputSnapshot?: string
  awaitingCompaction: boolean
  executionDispatched: boolean
}

interface Dependencies {
  isBusy: () => boolean
  load: () => Promise<PendingPlanExecution | null>
  /** Host performs the atomic idle + readiness + unclaimed check. */
  claim: () => Promise<unknown>
  submit: (pending: PendingPlanExecution) => void
  clear: () => Promise<unknown>
}

/** One dispatcher for both live completion and reload recovery. A notification
 * is only a wakeup: persisted readiness and an explicit atomic claim authorize
 * execution, never event text or a timeout. Other windows use the same claim. */
export function createPendingPlanDispatcher(deps: Dependencies) {
  let disposed = false
  let running: Promise<void> | undefined
  let requested = false
  const drain = async () => {
    do {
      requested = false
      if (disposed || deps.isBusy()) return
      const pending = await deps.load()
      if (disposed || deps.isBusy()) return
      if (!pending || pending.awaitingCompaction || pending.executionDispatched) continue
      if (await deps.claim() !== true) continue
      // Once the host accepts ownership, finish this session-bound dispatch even
      // if its UI listener unmounts while the claim RPC is returning. Cancelling
      // here would leave a persisted "dispatched" record without an actual send.
      deps.submit(pending)
      await deps.clear()
    } while (requested && !disposed)
  }
  return {
    request(): Promise<void> {
      if (disposed) return Promise.resolve()
      requested = true
      if (!running) running = drain().finally(() => { running = undefined })
      return running
    },
    dispose() { disposed = true },
  }
}
