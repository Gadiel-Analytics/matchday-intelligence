import {
  ROTATION_SIZE,
  TRACKED_COMPETITIONS,
  addWriteCounts,
  emptyWriteCounts,
  fetchMatches,
  fetchStandings,
  normaliseMatch,
  planCompetitionWrite,
  planMatchWrites,
  planStandingsTransition,
  readTotalStandings,
  seasonLabel,
  selectRotation,
  selectScope,
  type CompetitionColumns,
  type IngestScope,
  type MatchColumns,
  type NormalisedMatch,
  type StandingColumns,
  type SyncSummary,
} from './sync'

export interface SyncEnv {
  DB: D1Database
  FOOTBALL_DATA_API_KEY?: string
}

/**
 * Mirrors worker/wrangler.toml. The site publishes this figure, so it must
 * never describe a schedule the Worker is not actually running.
 *
 * TEMPORARY CONTAINMENT (M1): the match window is hourly, not every 5 minutes.
 * - 13 match-window hours × 1 run/hour
 * - 6 overnight runs
 * Restore `13 * 12 + 6` when wrangler.toml goes back to the 5-minute cron.
 *
 * Each competition consumes standings + matches: two feed requests.
 */
const REQUESTS_PER_COMPETITION = 2
const SCHEDULED_RUNS_PER_DAY = 13 * 1 + 6
const EXPECTED_REQUESTS_PER_DAY =
  SCHEDULED_RUNS_PER_DAY * ROTATION_SIZE * REQUESTS_PER_COMPETITION

/** D1 batches are one round trip; 40 keeps a batch well inside every limit. */
const BATCH_SIZE = 40

/**
 * One ingestion pass.
 *
 * Never throws: a scheduled handler that throws produces a failed invocation
 * and no record of why. Errors are collected into the summary and written to
 * sync_status, so the failure is visible on the page rather than only in logs.
 */
export async function runScheduledSync(
  env: SyncEnv,
  now: Date = new Date(),
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    competitions: [],
    matchesIngested: 0,
    standingsIngested: 0,
    unresolved: 0,
    errors: [],
    writes: emptyWriteCounts(),
  }

  if (!env.FOOTBALL_DATA_API_KEY) {
    summary.errors.push('FOOTBALL_DATA_API_KEY is not set; skipping run.')
    await recordStatus(env.DB, summary, now).catch(() => undefined)
    return summary
  }

  const scope = selectScope(now)
  const runIndex = await nextRunIndex(env.DB)
  const rotation = selectRotation(runIndex)

  for (const competition of rotation) {
    try {
      await ingestCompetition(env, competition, scope, summary, now)
      summary.competitions.push(competition.code)
    } catch (error) {
      summary.errors.push(
        `${competition.code}: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    }
  }

  await recordStatus(env.DB, summary, now, runIndex + 1).catch((error) => {
    console.error('Failed to record sync_status', error)
  })

  return summary
}

async function ingestCompetition(
  env: SyncEnv,
  competition: (typeof TRACKED_COMPETITIONS)[number],
  scope: IngestScope,
  summary: SyncSummary,
  now: Date,
): Promise<void> {
  const apiKey = env.FOOTBALL_DATA_API_KEY as string
  const stamp = now.toISOString()
  const statements: D1PreparedStatement[] = []

  // Counted locally and folded into the run summary only once the statements
  // below have actually been applied. Errors are pushed to the summary as
  // they happen: a diagnostic that does not survive a failed run is useless,
  // whereas a write count that survives one is a lie.
  const counts = emptyWriteCounts()
  let matchesCompared = 0
  let standingsCompared = 0
  let unresolvedRows = 0

  /* ---- standings ------------------------------------------------------- */

  const standingsPayload = await fetchStandings(competition.code, apiKey)
  const check = readTotalStandings(standingsPayload, competition.code)
  const storedCompetition = await readCompetition(env.DB, competition.code)

  // Season comes from the standings payload. When that payload is unusable we
  // keep whatever we already recorded rather than inventing a label.
  const season = check.ok
    ? seasonLabel(standingsPayload.season?.startDate, standingsPayload.season?.endDate)
    : (storedCompetition?.season ?? 'unknown')

  /* ---- competition metadata -------------------------------------------- */

  // Written before matches regardless of the standings outcome: matches carry
  // a foreign key onto this row, so it has to exist even on a run where the
  // standings payload was rejected.
  const competitionPlan = planCompetitionWrite(
    {
      name: competition.name,
      short_name: competition.shortName,
      area: competition.area,
      shape: competition.shape,
      season,
    },
    storedCompetition,
  )

  if (competitionPlan.kind === 'insert') {
    statements.push(
      env.DB.prepare(
        `INSERT INTO competitions (code, name, short_name, area, shape, season, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET
           name = excluded.name,
           short_name = excluded.short_name,
           area = excluded.area,
           shape = excluded.shape,
           season = excluded.season,
           updated_at = excluded.updated_at`,
      ).bind(
        competition.code,
        competitionPlan.columns.name,
        competitionPlan.columns.short_name,
        competitionPlan.columns.area,
        competitionPlan.columns.shape,
        competitionPlan.columns.season,
        stamp,
      ),
    )
    counts.competitionsWritten += 1
  } else if (competitionPlan.kind === 'update') {
    const { sql, values } = assignments(competitionPlan.changed)
    statements.push(
      env.DB.prepare(
        `UPDATE competitions SET ${sql}, updated_at = ? WHERE code = ?`,
      ).bind(...values, stamp, competition.code),
    )
    counts.competitionsWritten += 1
  }

  if (!check.ok) {
    // Never interpret "the provider returned nothing" as "the league is empty".
    summary.errors.push(
      `${competition.code}: standings unavailable (${check.reason}); stored standings left untouched`,
    )
  } else {
    const storedStandings = await readStandings(env.DB, competition.code)
    const transition = planStandingsTransition(check.rows, storedStandings)

    if (!transition.ok) {
      // Structurally valid, but it describes fewer teams than we hold. Keep
      // what is stored and surface why, rather than deleting on a reading we
      // cannot justify.
      summary.errors.push(
        `${competition.code}: standings ${transition.reason}; stored standings left untouched`,
      )
    } else {
      const plan = transition.plan

      for (const row of plan.inserts) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO standings (
               competition_code, position, team_id, team_name, team_crest,
               played, won, drawn, lost, goals_for, goals_against,
               goal_difference, points, form, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(competition_code, team_id) DO UPDATE SET
               position = excluded.position,
               team_name = excluded.team_name,
               team_crest = excluded.team_crest,
               played = excluded.played,
               won = excluded.won,
               drawn = excluded.drawn,
               lost = excluded.lost,
               goals_for = excluded.goals_for,
               goals_against = excluded.goals_against,
               goal_difference = excluded.goal_difference,
               points = excluded.points,
               form = excluded.form,
               updated_at = excluded.updated_at`,
          ).bind(
            competition.code,
            row.position,
            row.team_id,
            row.team_name,
            row.team_crest,
            row.played,
            row.won,
            row.drawn,
            row.lost,
            row.goals_for,
            row.goals_against,
            row.goal_difference,
            row.points,
            row.form,
            stamp,
          ),
        )
      }

      for (const row of plan.updates) {
        const { sql, values } = assignments(row.changed)
        statements.push(
          env.DB.prepare(
            `UPDATE standings SET ${sql}, updated_at = ?
              WHERE competition_code = ? AND team_id = ?`,
          ).bind(...values, stamp, competition.code, row.team_id),
        )
      }

      for (const teamId of plan.removals) {
        statements.push(
          env.DB.prepare(
            `DELETE FROM standings WHERE competition_code = ? AND team_id = ?`,
          ).bind(competition.code, teamId),
        )
      }

      standingsCompared += plan.compared
      counts.standingsInserted += plan.inserts.length
      counts.standingsUpdated += plan.updates.length
      counts.standingsRemoved += plan.removals.length
      counts.standingsUnchanged += plan.unchanged
    }
  }

  /* ---- matches --------------------------------------------------------- */

  const matchesPayload = await fetchMatches(competition.code, apiKey, scope)
  const feedMatches = matchesPayload.matches ?? []

  const normalised = feedMatches.map((match) => normaliseMatch(match, competition.code))
  unresolvedRows += normalised.filter((row) => row === null).length

  const usable = normalised.filter((row): row is NormalisedMatch => row !== null)
  const storedMatches = await readMatches(env.DB, competition.code, scope)
  const matchPlan = planMatchWrites(usable, storedMatches)

  for (const row of matchPlan.inserts) {
    // Still an upsert, not a bare INSERT. In window mode the stored set is
    // read for the same window, so a fixture rescheduled INTO the window
    // looks new while its row already exists. Converging on conflict is what
    // keeps reruns idempotent, which is a standing invariant.
    statements.push(
      env.DB.prepare(
        `INSERT INTO matches (
           id, competition_code, matchday, stage, kickoff_utc, status,
           home_team_id, home_team_name, home_team_crest,
           away_team_id, away_team_name, away_team_crest,
           home_score, away_score, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           matchday = excluded.matchday,
           stage = excluded.stage,
           kickoff_utc = excluded.kickoff_utc,
           status = excluded.status,
           home_team_name = excluded.home_team_name,
           home_team_crest = excluded.home_team_crest,
           away_team_name = excluded.away_team_name,
           away_team_crest = excluded.away_team_crest,
           home_score = excluded.home_score,
           away_score = excluded.away_score,
           updated_at = excluded.updated_at`,
      ).bind(
        row.id,
        row.competition_code,
        row.matchday,
        row.stage,
        row.kickoff_utc,
        row.status,
        row.home_team_id,
        row.home_team_name,
        row.home_team_crest,
        row.away_team_id,
        row.away_team_name,
        row.away_team_crest,
        row.home_score,
        row.away_score,
        stamp,
      ),
    )
  }

  for (const row of matchPlan.updates) {
    // Only the columns that differ. A `kickoff_utc` or `status` assignment
    // rewrites its index whether or not the value moved, so leaving unchanged
    // columns out of the SET list is what avoids the index write.
    const { sql, values } = assignments(row.changed)
    statements.push(
      env.DB.prepare(`UPDATE matches SET ${sql}, updated_at = ? WHERE id = ?`).bind(
        ...values,
        stamp,
        row.id,
      ),
    )
  }

  matchesCompared += matchPlan.compared
  counts.matchesInserted += matchPlan.inserts.length
  counts.matchesUpdated += matchPlan.updates.length
  counts.matchesUnchanged += matchPlan.unchanged

  /* ---- apply ----------------------------------------------------------- */

  // On a quiet run this list is empty and the competition costs zero writes,
  // which is the entire point of the change.
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await env.DB.batch(statements.slice(index, index + BATCH_SIZE))
  }

  // Past this line the writes have landed, so the counts describe what the
  // database actually did. Anything that threw above -- a feed timeout, a
  // rejected batch -- leaves the summary untouched by this competition rather
  // than crediting it with writes that never happened.
  summary.matchesIngested += matchesCompared
  summary.standingsIngested += standingsCompared
  summary.unresolved += unresolvedRows
  addWriteCounts(summary.writes, counts)
}

/**
 * Builds `col = ?` assignments for the columns that changed.
 *
 * The keys can only come from the column allow-lists in sync.ts, never from
 * feed data, so there is no interpolation of untrusted text here.
 */
function assignments<T extends object>(changed: Partial<T>): {
  sql: string
  values: unknown[]
} {
  const keys = Object.keys(changed) as (keyof T & string)[]

  return {
    sql: keys.map((key) => `${key} = ?`).join(', '),
    values: keys.map((key) => changed[key]),
  }
}

async function readCompetition(
  db: D1Database,
  code: string,
): Promise<CompetitionColumns | null> {
  const row = await db
    .prepare(
      `SELECT name, short_name, area, shape, season FROM competitions WHERE code = ?`,
    )
    .bind(code)
    .first<CompetitionColumns>()

  return row ?? null
}

async function readStandings(
  db: D1Database,
  code: string,
): Promise<Map<number, StandingColumns>> {
  const result = await db
    .prepare(
      `SELECT team_id, position, team_name, team_crest, played, won, drawn, lost,
              goals_for, goals_against, goal_difference, points, form
         FROM standings WHERE competition_code = ?`,
    )
    .bind(code)
    .all<StandingColumns & { team_id: number }>()

  const stored = new Map<number, StandingColumns>()

  for (const { team_id: teamId, ...columns } of result.results ?? []) {
    stored.set(teamId, columns)
  }

  return stored
}

const MATCH_SELECT = `SELECT id, competition_code, matchday, stage, kickoff_utc, status,
              home_team_id, home_team_name, home_team_crest,
              away_team_id, away_team_name, away_team_crest,
              home_score, away_score
         FROM matches`

async function readMatches(
  db: D1Database,
  code: string,
  scope: IngestScope,
): Promise<Map<number, MatchColumns>> {
  // The window predicate is served by idx_matches_competition_kickoff, so a
  // match-window run scans the window rather than the season.
  const statement =
    scope.kind === 'window'
      ? db
          .prepare(
            `${MATCH_SELECT} WHERE competition_code = ?
                AND kickoff_utc >= ? AND kickoff_utc < ?`,
          )
          .bind(code, scope.dateFrom, scope.storedUpperExclusive)
      : db.prepare(`${MATCH_SELECT} WHERE competition_code = ?`).bind(code)

  const result = await statement.all<MatchColumns & { id: number }>()
  const stored = new Map<number, MatchColumns>()

  for (const { id, ...columns } of result.results ?? []) {
    stored.set(id, columns)
  }

  return stored
}

async function nextRunIndex(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT run_index FROM sync_status WHERE id = 'global'`)
    .first<{ run_index: number }>()

  return row?.run_index ?? 0
}

/**
 * Written on every run, unconditionally.
 *
 * This is the one row whose whole purpose is to answer "when did we last
 * check", so making it change-aware would defeat it: a quiet run is exactly
 * the case where freshness still has to be reported. Two metered writes per
 * run is a rounding error against the budget the rest of this change frees up.
 */
async function recordStatus(
  db: D1Database,
  summary: SyncSummary,
  now: Date,
  nextIndex?: number,
): Promise<void> {
  const stamp = now.toISOString()

  await db
    .prepare(
      `INSERT INTO sync_status (
         id, last_run_at, run_index, competitions_synced, matches_ingested,
         unresolved, errors, requests_per_day, updated_at
       ) VALUES ('global', ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_run_at = excluded.last_run_at,
         run_index = excluded.run_index,
         competitions_synced = excluded.competitions_synced,
         matches_ingested = excluded.matches_ingested,
         unresolved = excluded.unresolved,
         errors = excluded.errors,
         requests_per_day = excluded.requests_per_day,
         updated_at = excluded.updated_at`,
    )
    .bind(
      stamp,
      nextIndex ?? 0,
      JSON.stringify(summary.competitions),
      summary.matchesIngested,
      summary.unresolved,
      JSON.stringify(summary.errors),
      EXPECTED_REQUESTS_PER_DAY,
      stamp,
    )
    .run()
}
