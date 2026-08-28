import type { ApiEnvelope, CompetitionSnapshot, SyncStatus } from '../types/domain'

/**
 * Read-only API client.
 *
 * There are no write methods here, by design. The public build cannot mutate
 * anything, so there is no token to leak and no authenticated surface to
 * defend — see the decision log entry on read-only-by-construction.
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

/** A trailing slash produces `//api/...`, which some hosts reject on preflight. */
const API_BASE = RAW_BASE.replace(/\/+$/, '')

export const API_CONFIGURED = API_BASE.length > 0

export class ApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (!API_CONFIGURED) {
    throw new ApiError('VITE_API_BASE_URL is not set, so no pipeline endpoint is configured.')
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { signal })
  } catch (cause) {
    throw new ApiError(
      cause instanceof Error && cause.name === 'AbortError'
        ? 'Request cancelled.'
        : 'Could not reach the pipeline API.',
    )
  }

  if (!response.ok) {
    throw new ApiError(`Pipeline API responded ${response.status}.`, response.status)
  }

  return (await response.json()) as T
}

export function fetchSnapshots(signal?: AbortSignal) {
  return get<ApiEnvelope<CompetitionSnapshot[]>>('/api/competitions/snapshots', signal)
}

export function fetchSyncStatus(signal?: AbortSignal) {
  return get<ApiEnvelope<SyncStatus>>('/api/sync-status', signal)
}

/** Exposed so the API explorer can show the real base it is calling. */
export const apiBaseForDisplay = API_CONFIGURED ? API_BASE : '(not configured)'

export const READ_ONLY_ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/competitions/snapshots',
    description: 'Table, recent results and next fixtures for every tracked competition.',
  },
  {
    method: 'GET',
    path: '/api/competitions/{code}',
    description: 'A single competition snapshot, by football-data.org code.',
  },
  {
    method: 'GET',
    path: '/api/sync-status',
    description: 'When the pipeline last ran, what it covered, and what it could not resolve.',
  },
  {
    method: 'GET',
    path: '/api/health',
    description: 'Liveness and schema version.',
  },
] as const
