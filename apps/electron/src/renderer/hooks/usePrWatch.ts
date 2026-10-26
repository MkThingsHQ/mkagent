/**
 * The Coding-mode PR chip's data: subscribes to the workspace server's PR watcher for a session
 * while `enabled` and the window is visible, applies its `prWatch:changed` pushes, and loads the
 * card's details when the card opens (then every 15 s while it stays open).
 *
 * Unsubscribing when hidden is what pauses polling; re-subscribing when shown refreshes at once.
 * The state starts (and stays, until a PR is known) at a kind the chip doesn't render.
 */

import * as React from 'react'
import type { PrDetails, PrWatchState } from '@mkagent/shared/protocol'

/** While the card is open, its details are re-read this often (the server caches them for 10 s). */
const DETAILS_REFRESH_MS = 15_000
/** A Refresh that gets no push back (nothing changed) stops spinning after this long. */
const REFRESH_SPINNER_MAX_MS = 10_000

export interface PrWatch {
  state: PrWatchState
  refresh: () => void
  onCardOpenChange: (open: boolean) => void
}

const LOADING: PrWatchState = { kind: 'loading' }

function useDocumentVisible(): boolean {
  const [visible, setVisible] = React.useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  React.useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

export function usePrWatch(sessionId: string, enabled: boolean, workingDirectory: string | undefined): PrWatch {
  const visible = useDocumentVisible()
  // Tagged with its session: after a session switch the old state must not render even for a frame
  const [tagged, setTagged] = React.useState<{ sessionId: string; state: PrWatchState }>({ sessionId, state: LOADING })
  const base = tagged.sessionId === sessionId ? tagged.state : LOADING
  const setBase = React.useCallback((next: PrWatchState | ((current: PrWatchState) => PrWatchState)) => {
    setTagged(current => {
      const currentState = current.sessionId === sessionId ? current.state : LOADING
      return { sessionId, state: typeof next === 'function' ? next(currentState) : next }
    })
  }, [sessionId])
  const [details, setDetails] = React.useState<{ key: string; value: PrDetails } | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [cardOpen, setCardOpen] = React.useState(false)
  const active = enabled && visible

  // The watcher turned off or the folder changed: start from nothing
  React.useEffect(() => {
    setBase(LOADING)
    setDetails(null)
  }, [setBase, enabled, workingDirectory])

  React.useEffect(() => {
    const api = window.electronAPI
    if (!active || !api?.prWatchSubscribe) return
    let cancelled = false
    let subscriptionId: string | null = null
    const off = api.onPrWatchChanged((changedSessionId, state) => {
      if (changedSessionId !== sessionId) return
      setBase(state)
      setRefreshing(false)
    })
    api.prWatchSubscribe(sessionId).then(
      (result) => {
        if (cancelled) {
          if (result.subscriptionId) void api.prWatchUnsubscribe(result.subscriptionId)
          return
        }
        subscriptionId = result.subscriptionId
        // A push may already have arrived with a newer state; `loading` must not overwrite it
        setBase(current => (result.state.kind === 'loading' && current.kind !== 'loading' ? current : result.state))
      },
      () => {
        if (!cancelled) setBase({ kind: 'unavailable', reason: 'error' })
      },
    )
    return () => {
      cancelled = true
      off()
      if (subscriptionId) void api.prWatchUnsubscribe(subscriptionId)
    }
  }, [active, sessionId, workingDirectory, setBase])

  // Details belong to one PR (kept on screen across pushes so the card doesn't flash skeletons);
  // each push re-reads them while the card is open
  const detailsKey = base.kind === 'pr' ? base.summary.url : null
  const pushedAt = base.kind === 'pr' ? base.summary.fetchedAt : 0
  React.useEffect(() => {
    const api = window.electronAPI
    if (!active || !cardOpen || !detailsKey || !api?.prWatchGetDetails) return
    let cancelled = false
    const load = () => {
      api.prWatchGetDetails(sessionId).then(
        (value) => {
          if (!cancelled && value) setDetails({ key: detailsKey, value })
        },
        () => {},
      )
    }
    load()
    const timer = setInterval(load, DETAILS_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [active, cardOpen, detailsKey, pushedAt, sessionId])

  React.useEffect(() => {
    if (!refreshing) return
    const timer = setTimeout(() => setRefreshing(false), REFRESH_SPINNER_MAX_MS)
    return () => clearTimeout(timer)
  }, [refreshing])

  const refresh = React.useCallback(() => {
    const api = window.electronAPI
    if (!api?.prWatchRefresh) return
    setRefreshing(true)
    void api.prWatchRefresh(sessionId).then(
      () => {
        // The card's details are part of what Refresh promises: re-read them too
        if (cardOpen) {
          void api.prWatchGetDetails(sessionId).then((value) => {
            if (value && detailsKey) setDetails({ key: detailsKey, value })
          }, () => {})
        }
        setRefreshing(false)
      },
      () => setRefreshing(false),
    )
  }, [sessionId, cardOpen, detailsKey])

  const state = React.useMemo<PrWatchState>(() => {
    if (base.kind !== 'pr') return base
    return {
      ...base,
      details: details && details.key === detailsKey ? details.value : undefined,
      refreshing,
    }
  }, [base, details, detailsKey, refreshing])

  return { state, refresh, onCardOpenChange: setCardOpen }
}
