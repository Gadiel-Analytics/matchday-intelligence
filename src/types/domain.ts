/**
 * Domain types.
 *
 * The public build is read-only: nothing here describes a mutation. Types
 * mirror what the Worker serves, which in turn mirrors the subset of
 * football-data.org we actually use.
 */

/** A competition tracked by the pipeline. `code` is football-data.org's own. */
export interface Competition {
  code: string
  name: string
  shortName: string
  area: string
  /** LEAGUE keeps a table; KNOCKOUT resolves by elimination. */
  shape: 'LEAGUE' | 'KNOCKOUT'
  /** Season label as published by the feed, e.g. "2026/27". */
  season: string
}

export type MatchStatus =
  | 'SCHEDULED'
  | 'TIMED'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'FINISHED'
  | 'POSTPONED'
  | 'SUSPENDED'
  | 'CANCELLED'

export interface Match {
  /** football-data.org's numeric match id, used as our primary key. */
  id: number
  competitionCode: string
  matchday: number | null
  stage: string | null
  kickoffUtc: string
  status: MatchStatus
  homeTeamId: number
  homeTeamName: string
  homeTeamCrest: string | null
  awayTeamId: number
  awayTeamName: string
  awayTeamCrest: string | null
  /**
   * Null means "not known", never zero. A scheduled match has no score; a
   * delayed feed has no score yet. Rendering either as 0-0 would be a false
   * statement, so the type forbids it.
   */
  homeScore: number | null
  awayScore: number | null
}

export interface StandingRow {
  position: number
  teamId: number
  teamName: string
  teamCrest: string | null
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  /** Most recent results, newest last, e.g. ['W','W','D','L','W']. */
  form: string[]
}

export interface CompetitionSnapshot {
  competition: Competition
  standings: StandingRow[]
  recentResults: Match[]
  upcomingFixtures: Match[]
}

/** Pipeline health. Surfaced to the reader rather than hidden in logs. */
export interface SyncStatus {
  lastRunAt: string | null
  /** Competition codes covered by the most recent completed rotation. */
  competitionsSynced: string[]
  matchesIngested: number
  /** Feed rows the pipeline could not resolve. Reported, never silently dropped. */
  unresolved: number
  errors: string[]
  /** Cron rules currently registered, for the cost/limits panel. */
  requestsPerDay: number
}

export interface ApiEnvelope<T> {
  ok: boolean
  data: T
  /** Two-dimension provenance: where it came from, and when we fetched it. */
  source: string
  fetchedAt: string | null
}

/* ---------------------------------------------------------------------------
   World Cup 2026 archive — frozen, anonymised, shipped as a static fixture.
   Kept in the repo rather than a live table so the case study cannot drift or
   break, and so a reader can inspect the actual data.
--------------------------------------------------------------------------- */

export interface ArchivePlayer {
  id: string
  displayName: string
  /** Deterministic owner colour used for the bracket ownership bars. */
  colour: string
}

export interface ArchiveTeam {
  id: string
  name: string
  flag: string
}

export interface ArchiveMatch {
  id: string
  round: 'Round of 16' | 'Quarter-final' | 'Semi-final' | 'Final'
  homeTeamId: string
  awayTeamId: string
  homeScore: number
  awayScore: number
  kickoffUtc: string
  /** Set when the scoreline encodes a shootout rather than open play. */
  note?: string
}

export interface ArchiveAssignment {
  playerId: string
  teamId: string
}

export interface ArchiveStanding {
  rank: number
  playerId: string
  points: number
  state: 'alive' | 'eliminated'
  teamIds: string[]
}
