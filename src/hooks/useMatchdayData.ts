import { useCallback, useEffect, useState } from 'react'
import { fetchSnapshots, fetchSyncStatus } from '../lib/apiClient'
import type { CompetitionSnapshot, SyncStatus } from '../types/domain'

type LoadState = 'loading' | 'ready' | 'error'

interface MatchdayData {
  snapshots: CompetitionSnapshot[]
  syncStatus: SyncStatus | null
  fetchedAt: string | null
  state: LoadState
  errorMessage: string | null
  reload: () => void
}

/**
 * Loads everything the live section needs in one place.
 *
 * On failure it reports the reason rather than falling back to placeholder
 * numbers. A dashboard that invents data when its source is down is worse than
 * one that admits it is down.
 */
export function useMatchdayData(): MatchdayData {
  const [snapshots, setSnapshots] = useState<CompetitionSnapshot[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => {
    // Set from the event handler, not from inside the effect: a synchronous
    // setState in an effect body triggers a second render pass before paint.
    setState('loading')
    setNonce((value) => value + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    Promise.all([
      fetchSnapshots(controller.signal),
      fetchSyncStatus(controller.signal),
    ])
      .then(([snapshotResponse, statusResponse]) => {
        if (!active) return
        setSnapshots(snapshotResponse.data)
        setSyncStatus(statusResponse.data)
        setFetchedAt(snapshotResponse.fetchedAt)
        setErrorMessage(null)
        setState('ready')
      })
      .catch((error: unknown) => {
        if (!active) return
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error.')
        setState('error')
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [nonce])

  return { snapshots, syncStatus, fetchedAt, state, errorMessage, reload }
}
