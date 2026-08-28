/**
 * football-data.org ingestion.
 *
 * Carried over from the v1 World Cup connector — same base URL, same
 * `X-Auth-Token` header, same defensive handling of a feed that is allowed to
 * be incomplete. Two things changed:
 *
 *   1. It reads several competitions instead of one.
 *   2. It keys on the feed's numeric team ids instead of a hand-maintained
 *      display-name table. v1's name table caused four production incidents in
 *      a single tournament; club competitions have far worse name variance
 *      ("Inter" / "Internazionale" / "FC Internazionale Milano"), so the table
 *      was retired rather than extended. See the decision log.
 */

const FD_BASE = 'https://api.football-data.org/v4'

/** Competitions tracked, in rotation order. Codes are football-data.org's. */
export const TRACKED_COMPETITIONS = [
  { code: 'PL', name: 'Premier League', shortName: 'Premier League', area: 'England', shape: 'LEAGUE' },
  { code: 'PD', name: 'La Liga', shortName: 'La Liga', area: 'Spain', shape: 'LEAGUE' },
  { code: 'SA', name: 'Serie A', shortName: 'Serie A', area: 'Italy', shape: 'LEAGUE' },
  { code: 'BL1', name: 'Bundesliga', shortName: 'Bundesliga', area: 'Germany', shape: 'LEAGUE' },
  { code: 'FL1', name: 'Ligue 1', shortName: 'Ligue 1', area: 'France', shape: 'LEAGUE' },
  { code: 'CL', name: 'UEFA Champions League', shortName: 'Champions League', area: 'Europe', shape: 'LEAGUE' },
] as const

export type CompetitionCode = (typeof TRACKED_COMPETITIONS)[number]['code']

/**
 * How many competitions one scheduled run refreshes.
 *
 * Three costs six calls per run against a ceiling of ten per minute, which
 * completes a full sweep of all six competitions in two runs. Four would sweep
 * faster but leaves only two calls of headroom for a retry landing in the same
 * minute; three keeps four calls spare.
 */
export const ROTATION_SIZE = 3

/* --------------------------------------------------------------------------
   Feed shapes — only the fields actually read are declared.
-------------------------------------------------------------------------- */

interface FdTeam {
  id: number
  name?: string
  shortName?: string
  crest?: string
}

export interface FdMatch {
  id: number
  utcDate: string
  status: string
  matchday: number | null
  stage?: string
  homeTeam: FdTeam
  awayTeam: FdTeam
  score: {
    winner: string | null
    fullTime: { home: number | null; away: number | null }
  }
}

export interface FdStanding {
  position: number
  team: FdTeam
  playedGames: number
  won: number
  draw: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  form?: string | null
}

export interface SyncSummary {
  competitions: string[]
  matchesIngested: number
  standingsIngested: number
  /** Feed rows missing an id or both team ids. Counted, never silently dropped. */
  unresolved: number
  errors: string[]
}

async function fdGet<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`${FD_BASE}${path}`, {
    headers: { 'X-Auth-Token': apiKey },
  })

  if (!response.ok) {
    throw new Error(`football-data.org ${path} responded ${response.status}`)
  }

  return (await response.json()) as T
}

export function fetchMatches(code: string, apiKey: string) {
  return fdGet<{ matches?: FdMatch[] }>(`/competitions/${code}/matches`, apiKey)
}

export function fetchStandings(code: string, apiKey: string) {
  return fdGet<{
    season?: { startDate?: string; endDate?: string }
    standings?: { type: string; table?: FdStanding[] }[]
  }>(`/competitions/${code}/standings`, apiKey)
}

/**
 * Picks the competitions this run should refresh.
 *
 * The feed allows ten requests per minute and each competition costs two, so
 * issuing all six together would exceed the ceiling. Rotating by run keeps
 * each run at six calls and refreshes everything on a predictable period.
 */
export function selectRotation(
  runIndex: number,
  size = ROTATION_SIZE,
): readonly (typeof TRACKED_COMPETITIONS)[number][] {
  const total = TRACKED_COMPETITIONS.length
  const start = (runIndex * size) % total

  return Array.from({ length: size }, (_, offset) => TRACKED_COMPETITIONS[(start + offset) % total])
}

/** Season label from the feed's own dates, e.g. "2026/27". */
export function seasonLabel(startDate?: string, endDate?: string): string {
  if (!startDate) return 'unknown'
  const startYear = startDate.slice(0, 4)
  if (!endDate) return startYear
  const endYear = endDate.slice(2, 4)
  return startYear === endDate.slice(0, 4) ? startYear : `${startYear}/${endYear}`
}

/**
 * Normalises a feed match into a storable row.
 *
 * Returns null when the row cannot be keyed — a match with no id, or a fixture
 * whose teams are not yet drawn. Callers count these rather than discarding
 * them quietly, so the pipeline can report what it could not resolve.
 */
export function normaliseMatch(
  match: FdMatch,
  competitionCode: string,
): {
  id: number
  competitionCode: string
  matchday: number | null
  stage: string | null
  kickoffUtc: string
  status: string
  homeTeamId: number
  homeTeamName: string
  homeTeamCrest: string | null
  awayTeamId: number
  awayTeamName: string
  awayTeamCrest: string | null
  homeScore: number | null
  awayScore: number | null
} | null {
  if (!match?.id || !match.homeTeam?.id || !match.awayTeam?.id) return null

  const isFinished = match.status === 'FINISHED'

  return {
    id: match.id,
    competitionCode,
    matchday: match.matchday ?? null,
    stage: match.stage ?? null,
    kickoffUtc: match.utcDate,
    status: match.status,
    homeTeamId: match.homeTeam.id,
    homeTeamName: match.homeTeam.shortName ?? match.homeTeam.name ?? 'Unknown',
    homeTeamCrest: match.homeTeam.crest ?? null,
    awayTeamId: match.awayTeam.id,
    awayTeamName: match.awayTeam.shortName ?? match.awayTeam.name ?? 'Unknown',
    awayTeamCrest: match.awayTeam.crest ?? null,
    // A match that has not finished has no score. Storing 0 would assert a
    // goalless result, which is a different statement from "not yet played".
    homeScore: isFinished ? (match.score.fullTime.home ?? null) : null,
    awayScore: isFinished ? (match.score.fullTime.away ?? null) : null,
  }
}

export function normaliseStanding(row: FdStanding, competitionCode: string) {
  if (!row?.team?.id) return null

  return {
    competitionCode,
    position: row.position,
    teamId: row.team.id,
    teamName: row.team.shortName ?? row.team.name ?? 'Unknown',
    teamCrest: row.team.crest ?? null,
    played: row.playedGames,
    won: row.won,
    drawn: row.draw,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalDifference,
    points: row.points,
    form: row.form ?? '',
  }
}
