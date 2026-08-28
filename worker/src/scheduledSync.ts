import {
  ROTATION_SIZE,
  TRACKED_COMPETITIONS,
  fetchMatches,
  fetchStandings,
  normaliseMatch,
  normaliseStanding,
  seasonLabel,
  selectRotation,
  type SyncSummary,
} from './sync'

export interface SyncEnv {
  DB: D1Database
  FOOTBALL_DATA_API_KEY?: string
}

/**
 * Mirrors worker/wrangler.toml:
 * - 13 match-window hours × 12 runs/hour
 * - 6 overnight runs
 * Each competition consumes standings + matches: two feed requests.
 */
const REQUESTS_PER_COMPETITION = 2
const SCHEDULED_RUNS_PER_DAY = 13 * 12 + 6
const EXPECTED_REQUESTS_PER_DAY =
  SCHEDULED_RUNS_PER_DAY * ROTATION_SIZE * REQUESTS_PER_COMPETITION

/**
 * One ingestion pass.
 *
 * Never throws: a scheduled handler that throws produces a failed invocation
 * and no record of why. Errors are collected into the summary and written to
 * sync_status, so the failure is visible on the page rather than only in logs.
 */
export async function runScheduledSync(env: SyncEnv): Promise<SyncSummary> {
  const summary: SyncSummary = {
    competitions: [],
    matchesIngested: 0,
    standingsIngested: 0,
    unresolved: 0,
    errors: [],
  }

  if (!env.FOOTBALL_DATA_API_KEY) {
    summary.errors.push('FOOTBALL_DATA_API_KEY is not set; skipping run.')
    await recordStatus(env.DB, summary).catch(() => undefined)
    return summary
  }

  const runIndex = await nextRunIndex(env.DB)
  const rotation = selectRotation(runIndex)

  for (const competition of rotation) {
    try {
      await ingestCompetition(env, competition, summary)
      summary.competitions.push(competition.code)
    } catch (error) {
      summary.errors.push(
        `${competition.code}: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    }
  }

  await recordStatus(env.DB, summary, runIndex + 1).catch((error) => {
    console.error('Failed to record sync_status', error)
  })

  return summary
}

async function ingestCompetition(
  env: SyncEnv,
  competition: (typeof TRACKED_COMPETITIONS)[number],
  summary: SyncSummary,
): Promise<void> {
  const apiKey = env.FOOTBALL_DATA_API_KEY as string
  const now = new Date().toISOString()

  const standingsPayload = await fetchStandings(competition.code, apiKey)
  const season = seasonLabel(
    standingsPayload.season?.startDate,
    standingsPayload.season?.endDate,
  )

  await env.DB.prepare(
    `INSERT INTO competitions (code, name, short_name, area, shape, season, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       name = excluded.name,
       short_name = excluded.short_name,
       area = excluded.area,
       shape = excluded.shape,
       season = excluded.season,
       updated_at = excluded.updated_at`,
  )
    .bind(
      competition.code,
      competition.name,
      competition.shortName,
      competition.area,
      competition.shape,
      season,
      now,
    )
    .run()

  // Standings are a full replacement: the feed's table is authoritative and a
  // partial merge could leave a relegated or withdrawn team stranded in ours.
  const table =
    standingsPayload.standings?.find((entry) => entry.type === 'TOTAL')?.table ?? []

  const standingRows = table
    .map((row) => normaliseStanding(row, competition.code))
    .filter((row): row is NonNullable<typeof row> => row !== null)

  await env.DB.prepare(`DELETE FROM standings WHERE competition_code = ?`)
    .bind(competition.code)
    .run()

  if (standingRows.length > 0) {
    await env.DB.batch(
      standingRows.map((row) =>
        env.DB.prepare(
          `INSERT INTO standings (
             competition_code, position, team_id, team_name, team_crest,
             played, won, drawn, lost, goals_for, goals_against,
             goal_difference, points, form, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          row.competitionCode,
          row.position,
          row.teamId,
          row.teamName,
          row.teamCrest,
          row.played,
          row.won,
          row.drawn,
          row.lost,
          row.goalsFor,
          row.goalsAgainst,
          row.goalDifference,
          row.points,
          row.form,
          now,
        ),
      ),
    )
    summary.standingsIngested += standingRows.length
  }

  const matchesPayload = await fetchMatches(competition.code, apiKey)
  const feedMatches = matchesPayload.matches ?? []

  const matchRows = feedMatches.map((match) => normaliseMatch(match, competition.code))
  summary.unresolved += matchRows.filter((row) => row === null).length

  const usable = matchRows.filter((row): row is NonNullable<typeof row> => row !== null)

  // Upsert keyed on the feed's own match id: reruns converge instead of
  // duplicating, so the job is safe to retry at any point.
  for (let index = 0; index < usable.length; index += 40) {
    const chunk = usable.slice(index, index + 40)
    await env.DB.batch(
      chunk.map((row) =>
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
          row.competitionCode,
          row.matchday,
          row.stage,
          row.kickoffUtc,
          row.status,
          row.homeTeamId,
          row.homeTeamName,
          row.homeTeamCrest,
          row.awayTeamId,
          row.awayTeamName,
          row.awayTeamCrest,
          row.homeScore,
          row.awayScore,
          now,
        ),
      ),
    )
  }

  summary.matchesIngested += usable.length
}

async function nextRunIndex(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT run_index FROM sync_status WHERE id = 'global'`)
    .first<{ run_index: number }>()

  return row?.run_index ?? 0
}

async function recordStatus(
  db: D1Database,
  summary: SyncSummary,
  nextIndex?: number,
): Promise<void> {
  const now = new Date().toISOString()
  const requestsPerDay = EXPECTED_REQUESTS_PER_DAY

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
      now,
      nextIndex ?? 0,
      JSON.stringify(summary.competitions),
      summary.matchesIngested,
      summary.unresolved,
      JSON.stringify(summary.errors),
      requestsPerDay,
      now,
    )
    .run()
}
