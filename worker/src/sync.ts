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

/**
 * Counts of what was actually mutated.
 *
 * Accumulated per competition and folded into the run summary ONLY after that
 * competition's statements have been applied, so a run that plans writes and
 * then fails before executing them reports nothing. Planned is not written,
 * and telemetry that conflates the two would mis-calibrate the M5 thresholds
 * it exists to inform.
 *
 * Caveat, stated rather than engineered away: statements are applied in
 * batches, so a competition that throws midway may have applied an earlier
 * batch whose counts are then not folded. Counts are authoritative for a
 * competition that completed, and under-report one that errored. Exact
 * partial-batch accounting is not worth the machinery here.
 *
 * Logged, not persisted: recording these in D1 needs a schema change, and the
 * core remediation deliberately ships without one so it stays revertible.
 */
export interface WriteCounts {
  matchesInserted: number
  matchesUpdated: number
  matchesUnchanged: number
  standingsInserted: number
  standingsUpdated: number
  standingsRemoved: number
  standingsUnchanged: number
  competitionsWritten: number
}

/** Folds a completed competition's counts into the run total. */
export function addWriteCounts(target: WriteCounts, source: WriteCounts): WriteCounts {
  for (const key of Object.keys(target) as (keyof WriteCounts)[]) {
    target[key] += source[key]
  }

  return target
}

export function emptyWriteCounts(): WriteCounts {
  return {
    matchesInserted: 0,
    matchesUpdated: 0,
    matchesUnchanged: 0,
    standingsInserted: 0,
    standingsUpdated: 0,
    standingsRemoved: 0,
    standingsUnchanged: 0,
    competitionsWritten: 0,
  }
}

export interface SyncSummary {
  competitions: string[]
  /**
   * Matches this run COVERED: normalised and compared against what is stored.
   *
   * Not "rows written". Once writes are change-proportional the written count
   * is zero on most runs, and the pipeline panel reads that as a dead
   * pipeline rather than a healthy one. The surface label is "Matches held",
   * which is what this number now honestly answers.
   */
  matchesIngested: number
  /** Standings rows covered by this run, on the same basis. */
  standingsIngested: number
  /** Feed rows missing an id or both team ids. Counted, never silently dropped. */
  unresolved: number
  errors: string[]
  writes: WriteCounts
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

export function fetchMatches(code: string, apiKey: string, scope: IngestScope) {
  // Unscoped, this endpoint returns the whole season -- several hundred rows
  // per competition, on every run. The window keeps a match-window run to a
  // few dozen; overnight runs still ask for everything, deliberately.
  const query =
    scope.kind === 'window'
      ? `?dateFrom=${scope.dateFrom}&dateTo=${scope.dateTo}`
      : ''

  return fdGet<{ matches?: FdMatch[] }>(`/competitions/${code}/matches${query}`, apiKey)
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
export interface NormalisedMatch {
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
}

export function normaliseMatch(
  match: FdMatch,
  competitionCode: string,
): NormalisedMatch | null {
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

export interface NormalisedStanding {
  competitionCode: string
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
  form: string
}

export function normaliseStanding(
  row: FdStanding,
  competitionCode: string,
): NormalisedStanding | null {
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

/* --------------------------------------------------------------------------
   Ingest scope.

   Which slice of the season a run refreshes, chosen from the clock rather
   than from the cron string so the split survives a cadence change.

     - Match window (11:00-23:59 UTC): a narrow date range around today. This
       is where results actually move, and it holds the comparison set to a
       few dozen rows per competition.

     - Overnight (00:00-10:00 UTC): the whole season. Once writes are
       change-proportional, read scope stops driving write cost -- a full
       sweep that finds nothing changed costs zero writes -- so the cheapest
       way to repair drift, learn a new season's fixture list, and pick up a
       fixture rescheduled outside the window is to look at everything while
       nothing is happening.

   That second point is what removes the need for a separate bootstrap path.
   A once-a-season code path is a code path that is never exercised and
   therefore never known to work.
-------------------------------------------------------------------------- */

export const WINDOW_DAYS_BACK = 3
export const WINDOW_DAYS_FORWARD = 14

/** Runs before this UTC hour reconcile the full season. */
export const RECONCILIATION_END_HOUR_UTC = 11

export interface MatchWindow {
  /** Inclusive, in the feed's yyyy-MM-dd form. */
  dateFrom: string
  /** Inclusive, in the feed's yyyy-MM-dd form. */
  dateTo: string
  /**
   * Exclusive upper bound for comparing against stored ISO timestamps.
   *
   * `kickoff_utc` is a full ISO instant, so a plain string comparison against
   * `dateTo` would drop everything after midnight on the final day. Comparing
   * `< dateTo + 1 day` keeps that day whole and stays index-friendly.
   */
  storedUpperExclusive: string
}

export type IngestScope = ({ kind: 'window' } & MatchWindow) | { kind: 'season' }

const DAY_MS = 86_400_000

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Date arithmetic in UTC milliseconds, so month and year ends carry cleanly. */
export function computeWindow(
  now: Date,
  daysBack = WINDOW_DAYS_BACK,
  daysForward = WINDOW_DAYS_FORWARD,
): MatchWindow {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  return {
    dateFrom: isoDay(midnight - daysBack * DAY_MS),
    dateTo: isoDay(midnight + daysForward * DAY_MS),
    storedUpperExclusive: isoDay(midnight + (daysForward + 1) * DAY_MS),
  }
}

export function selectScope(now: Date): IngestScope {
  if (now.getUTCHours() < RECONCILIATION_END_HOUR_UTC) return { kind: 'season' }

  return { kind: 'window', ...computeWindow(now) }
}

/* --------------------------------------------------------------------------
   Change detection.

   The rule this whole change exists to enforce:

     persistence cost must be proportional to data change, not to polling
     frequency or season size.

   Everything below is pure. It decides what to write; it never writes. That
   keeps the expensive-to-get-wrong part testable without a database.
-------------------------------------------------------------------------- */

/**
 * Columns compared to decide whether a row changed.
 *
 * `updated_at` is deliberately absent. It is bookkeeping, and including it
 * was the original defect: bound to a fresh timestamp every run, it made
 * every comparison unequal and every row a write.
 */
export interface MatchColumns {
  competition_code: string
  matchday: number | null
  stage: string | null
  kickoff_utc: string
  status: string
  home_team_id: number
  home_team_name: string
  home_team_crest: string | null
  away_team_id: number
  away_team_name: string
  away_team_crest: string | null
  home_score: number | null
  away_score: number | null
}

export const MATCH_COLUMNS: readonly (keyof MatchColumns)[] = [
  'competition_code',
  'matchday',
  'stage',
  'kickoff_utc',
  'status',
  'home_team_id',
  'home_team_name',
  'home_team_crest',
  'away_team_id',
  'away_team_name',
  'away_team_crest',
  'home_score',
  'away_score',
]

export interface StandingColumns {
  position: number
  team_name: string
  team_crest: string | null
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
  form: string
}

export const STANDING_COLUMNS: readonly (keyof StandingColumns)[] = [
  'position',
  'team_name',
  'team_crest',
  'played',
  'won',
  'drawn',
  'lost',
  'goals_for',
  'goals_against',
  'goal_difference',
  'points',
  'form',
]

export interface CompetitionColumns {
  name: string
  short_name: string
  area: string
  shape: string
  season: string
}

export const COMPETITION_COLUMNS: readonly (keyof CompetitionColumns)[] = [
  'name',
  'short_name',
  'area',
  'shape',
  'season',
]

/**
 * Strict, uncoerced comparison.
 *
 * `null !== 0` here, and that is the point: "no result yet" and "goalless"
 * are different statements, and a comparison that conflated them would erase
 * the distinction the schema goes out of its way to preserve.
 */
function changedColumns<T extends object>(
  columns: readonly (keyof T)[],
  current: T,
  next: T,
): Partial<T> {
  const changed: Partial<T> = {}

  for (const column of columns) {
    if (current[column] !== next[column]) changed[column] = next[column]
  }

  return changed
}

export function matchColumns(row: NormalisedMatch): MatchColumns {
  return {
    competition_code: row.competitionCode,
    matchday: row.matchday,
    stage: row.stage,
    kickoff_utc: row.kickoffUtc,
    status: row.status,
    home_team_id: row.homeTeamId,
    home_team_name: row.homeTeamName,
    home_team_crest: row.homeTeamCrest,
    away_team_id: row.awayTeamId,
    away_team_name: row.awayTeamName,
    away_team_crest: row.awayTeamCrest,
    home_score: row.homeScore,
    away_score: row.awayScore,
  }
}

export function standingColumns(row: NormalisedStanding): StandingColumns {
  return {
    position: row.position,
    team_name: row.teamName,
    team_crest: row.teamCrest,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goals_for: row.goalsFor,
    goals_against: row.goalsAgainst,
    goal_difference: row.goalDifference,
    points: row.points,
    form: row.form,
  }
}

export interface MatchWritePlan {
  inserts: (MatchColumns & { id: number })[]
  /** Only the columns that actually differ, so an untouched index stays untouched. */
  updates: { id: number; changed: Partial<MatchColumns> }[]
  unchanged: number
  compared: number
}

export function planMatchWrites(
  incoming: readonly NormalisedMatch[],
  stored: ReadonlyMap<number, MatchColumns>,
): MatchWritePlan {
  const plan: MatchWritePlan = {
    inserts: [],
    updates: [],
    unchanged: 0,
    compared: incoming.length,
  }

  for (const row of incoming) {
    const next = matchColumns(row)
    const current = stored.get(row.id)

    if (!current) {
      plan.inserts.push({ id: row.id, ...next })
      continue
    }

    const changed = changedColumns(MATCH_COLUMNS, current, next)

    if (Object.keys(changed).length === 0) plan.unchanged += 1
    else plan.updates.push({ id: row.id, changed })
  }

  return plan
}

export interface StandingsWritePlan {
  inserts: (StandingColumns & { team_id: number })[]
  updates: { team_id: number; changed: Partial<StandingColumns> }[]
  /** Teams the feed's authoritative table no longer lists. */
  removals: number[]
  unchanged: number
  compared: number
}

export function planStandingWrites(
  incoming: readonly NormalisedStanding[],
  stored: ReadonlyMap<number, StandingColumns>,
): StandingsWritePlan {
  const plan: StandingsWritePlan = {
    inserts: [],
    updates: [],
    removals: [],
    unchanged: 0,
    compared: incoming.length,
  }

  const seen = new Set<number>()

  for (const row of incoming) {
    seen.add(row.teamId)

    const next = standingColumns(row)
    const current = stored.get(row.teamId)

    if (!current) {
      plan.inserts.push({ team_id: row.teamId, ...next })
      continue
    }

    const changed = changedColumns(STANDING_COLUMNS, current, next)

    if (Object.keys(changed).length === 0) plan.unchanged += 1
    else plan.updates.push({ team_id: row.teamId, changed })
  }

  // A relegated or withdrawn team must not survive in our copy of the table.
  // This replaces the old blanket DELETE, which achieved the same end by
  // destroying the table first and asking questions afterwards.
  for (const teamId of stored.keys()) {
    if (!seen.has(teamId)) plan.removals.push(teamId)
  }

  return plan
}

export type CompetitionWritePlan =
  | { kind: 'insert'; columns: CompetitionColumns }
  | { kind: 'update'; changed: Partial<CompetitionColumns> }
  | { kind: 'unchanged' }

export function planCompetitionWrite(
  next: CompetitionColumns,
  current: CompetitionColumns | null,
): CompetitionWritePlan {
  if (!current) return { kind: 'insert', columns: next }

  const changed = changedColumns(COMPETITION_COLUMNS, current, next)

  return Object.keys(changed).length === 0
    ? { kind: 'unchanged' }
    : { kind: 'update', changed }
}

/* --------------------------------------------------------------------------
   Standings payload guard.

   The feed's TOTAL table is authoritative when it is present and populated.
   A transient provider hiccup is not an authoritative statement that a
   league has no teams, and must never be applied as one.

   The previous code deleted a competition's standings BEFORE it knew whether
   the payload contained anything, then inserted only `if (rows.length > 0)`.
   A missing TOTAL table therefore emptied the table and the API served an
   empty league -- turning "we could not check" into "there is nothing there",
   which is exactly the confusion the schema's nullable scores exist to avoid.
-------------------------------------------------------------------------- */

export interface StandingsPayload {
  season?: { startDate?: string; endDate?: string }
  standings?: { type: string; table?: FdStanding[] }[]
}

export type StandingsCheck =
  | { ok: true; rows: NormalisedStanding[] }
  | { ok: false; reason: string }

export function readTotalStandings(
  payload: StandingsPayload | null | undefined,
  competitionCode: string,
): StandingsCheck {
  if (!payload || !Array.isArray(payload.standings)) {
    return { ok: false, reason: 'payload carried no standings array' }
  }

  const total = payload.standings.find((entry) => entry?.type === 'TOTAL')
  if (!total) return { ok: false, reason: 'payload carried no TOTAL standings table' }

  if (!Array.isArray(total.table)) {
    return { ok: false, reason: 'TOTAL standings table was not an array' }
  }

  // Every row or none.
  //
  // Filtering malformed rows away would hand the caller a table that looks
  // authoritative and is quietly one team short -- and a short table reads
  // downstream as "that team is no longer in this competition", which is a
  // deletion. A structurally broken payload is not a partial truth to salvage.
  const rows: NormalisedStanding[] = []

  for (const raw of total.table) {
    const row = normaliseStanding(raw, competitionCode)

    if (!row) {
      return { ok: false, reason: 'a TOTAL standings row carried no team id' }
    }

    rows.push(row)
  }

  // The one zero-row rejection. An empty table reaches here with an empty
  // rows array and is refused exactly once: a second length check earlier
  // would be unreachable in practice and impossible to mutation-test.
  if (rows.length === 0) {
    return { ok: false, reason: 'TOTAL standings table listed no teams' }
  }

  // A duplicate makes a table that counts as full while covering fewer teams
  // than it appears to, which is the same structural incompleteness by a
  // different route.
  const teamIds = new Set(rows.map((row) => row.teamId))

  if (teamIds.size !== rows.length) {
    return { ok: false, reason: 'TOTAL standings table listed a team more than once' }
  }

  return { ok: true, rows }
}

/* --------------------------------------------------------------------------
   Standings transition guard.

   A payload can be structurally perfect and still describe fewer teams than
   we hold. There is no honest way to tell a genuinely shrunken competition
   from a truncated response, so the safe reading is the conservative one:
   refuse the transition, keep what is stored, and say so.

   Deliberately a cardinality rule rather than a tuned percentage. Equal
   cardinality with different membership -- promotion and relegation -- still
   flows through as selective inserts and removals; only an unexplained net
   contraction is refused. Stale standings with a visible error beat a
   destructive interpretation of a partial provider response.
-------------------------------------------------------------------------- */

export type StandingsTransition =
  | { ok: true; plan: StandingsWritePlan }
  | { ok: false; reason: string }

/* --------------------------------------------------------------------------
   The standings trust decision.

   Structural validity and applicability are two different questions, and
   keeping them in two variables invited exactly one bug: the season was
   resolved from the structural answer while the standings themselves waited
   on the applicability answer. A payload could then be refused as a table and
   still relabel the competition it described.

   Collapsing both into one decision makes that divergence unrepresentable.
   There is a single `trusted`, and the season rides with it.
-------------------------------------------------------------------------- */

/**
 * Schema-required placeholder for a competition whose season has never been
 * established. It is a storage fallback, never a statement the feed made.
 */
export const UNKNOWN_SEASON = 'unknown'

/**
 * The feed's season label, or null when the feed did not supply one.
 *
 * `seasonLabel` answers a formatting question and returns the sentinel for
 * missing input, which makes "the provider said unknown" and "the provider
 * said nothing" the same string. They are not the same fact: the first is
 * authoritative and the second is an absence, and only the absence must leave
 * a known stored season alone. Null carries that distinction; the sentinel
 * cannot.
 */
export function providerSeason(payload: StandingsPayload | null | undefined): string | null {
  const startDate = payload?.season?.startDate

  if (!startDate) return null

  return seasonLabel(startDate, payload?.season?.endDate)
}

export type StandingsDecision =
  | { trusted: true; plan: StandingsWritePlan; season: string | null }
  | { trusted: false; reason: string }

export function decideStandings(
  payload: StandingsPayload | null | undefined,
  competitionCode: string,
  stored: ReadonlyMap<number, StandingColumns>,
): StandingsDecision {
  const check = readTotalStandings(payload, competitionCode)

  if (!check.ok) {
    return { trusted: false, reason: `standings unavailable (${check.reason})` }
  }

  const transition = planStandingsTransition(check.rows, stored)

  if (!transition.ok) {
    return { trusted: false, reason: `standings ${transition.reason}` }
  }

  return {
    trusted: true,
    plan: transition.plan,
    season: providerSeason(payload),
  }
}

/**
 * Season may only advance from a standings payload trusted end to end, and
 * only when that payload actually carried one.
 *
 * The season is a claim about which edition of a competition the stored table
 * describes. Advancing it from a payload we declined to apply would label a
 * stale table with a new season -- a competition reading 2027/28 over a
 * 2026/27 table, which is worse than either value alone because it is
 * internally inconsistent and nothing downstream can detect it.
 *
 * Trust and availability are separate conditions. A trusted table that simply
 * came without season metadata must not overwrite a known season with the
 * sentinel: forgetting is a change, and nothing here learned anything.
 *
 * The competition's other metadata comes from the tracked manifest rather
 * than the feed, so it stays maintained regardless. Only the season is gated.
 */
export function resolveSeason(
  decision: StandingsDecision,
  storedSeason: string | null,
): string {
  if (decision.trusted && decision.season !== null) return decision.season

  return storedSeason ?? UNKNOWN_SEASON
}

export function planStandingsTransition(
  incoming: readonly NormalisedStanding[],
  stored: ReadonlyMap<number, StandingColumns>,
): StandingsTransition {
  const incomingTeams = new Set(incoming.map((row) => row.teamId))

  if (stored.size > 0 && incomingTeams.size < stored.size) {
    return {
      ok: false,
      reason:
        `feed listed ${incomingTeams.size} teams against ${stored.size} stored; ` +
        'unexplained contraction not applied',
    }
  }

  return { ok: true, plan: planStandingWrites(incoming, stored) }
}
