import { runScheduledSync, type SyncEnv } from './scheduledSync'
import { TRACKED_COMPETITIONS } from './sync'

/**
 * Public API — read-only by construction.
 *
 * There is deliberately no POST, PATCH, PUT or DELETE handler in this file.
 * The only writer is the scheduled ingester below, which runs inside the
 * Worker and holds the only credential. Publishing this repository therefore
 * publishes no mutable surface: there is nothing to authenticate because there
 * is nothing to authorise.
 *
 * CORS is set for browser convenience only. It is not, and is never treated
 * as, an authorisation boundary.
 */

interface Env extends SyncEnv {
  ENVIRONMENT?: string
}

const SCHEMA_VERSION = '1.0.0'
const SOURCE = 'football-data.org/v4'

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=60',
  }
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders() })
}

function envelope<T>(data: T, fetchedAt: string | null) {
  return { ok: true, data, source: SOURCE, fetchedAt }
}

interface MatchRow {
  id: number
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

function toMatch(row: MatchRow) {
  return {
    id: row.id,
    competitionCode: row.competition_code,
    matchday: row.matchday,
    stage: row.stage,
    kickoffUtc: row.kickoff_utc,
    status: row.status,
    homeTeamId: row.home_team_id,
    homeTeamName: row.home_team_name,
    homeTeamCrest: row.home_team_crest,
    awayTeamId: row.away_team_id,
    awayTeamName: row.away_team_name,
    awayTeamCrest: row.away_team_crest,
    homeScore: row.home_score,
    awayScore: row.away_score,
  }
}

async function getSyncStatus(env: Env) {
  const row = await env.DB.prepare(
    `SELECT last_run_at, competitions_synced, matches_ingested, unresolved,
            errors, requests_per_day
       FROM sync_status WHERE id = 'global'`,
  ).first<{
    last_run_at: string | null
    competitions_synced: string
    matches_ingested: number
    unresolved: number
    errors: string
    requests_per_day: number
  }>()

  if (!row) {
    return {
      lastRunAt: null,
      competitionsSynced: [],
      matchesIngested: 0,
      unresolved: 0,
      errors: [],
      requestsPerDay: 0,
    }
  }

  return {
    lastRunAt: row.last_run_at,
    competitionsSynced: JSON.parse(row.competitions_synced) as string[],
    matchesIngested: row.matches_ingested,
    unresolved: row.unresolved,
    errors: JSON.parse(row.errors) as string[],
    requestsPerDay: row.requests_per_day,
  }
}

async function getSnapshot(env: Env, code: string) {
  const competition = await env.DB.prepare(
    `SELECT code, name, short_name AS shortName, area, shape, season
       FROM competitions WHERE code = ?`,
  )
    .bind(code)
    .first<{
      code: string
      name: string
      shortName: string
      area: string
      shape: string
      season: string
    }>()

  if (!competition) return null

  const standings = await env.DB.prepare(
    `SELECT position, team_id, team_name, team_crest, played, won, drawn, lost,
            goals_for, goals_against, goal_difference, points, form
       FROM standings WHERE competition_code = ? ORDER BY position ASC`,
  )
    .bind(code)
    .all<{
      position: number
      team_id: number
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
    }>()

  const recent = await env.DB.prepare(
    `SELECT * FROM matches
      WHERE competition_code = ? AND status = 'FINISHED'
      ORDER BY kickoff_utc DESC LIMIT 12`,
  )
    .bind(code)
    .all<MatchRow>()

  const upcoming = await env.DB.prepare(
    `SELECT * FROM matches
      WHERE competition_code = ? AND status IN ('SCHEDULED', 'TIMED')
      ORDER BY kickoff_utc ASC LIMIT 12`,
  )
    .bind(code)
    .all<MatchRow>()

  return {
    competition: {
      code: competition.code,
      name: competition.name,
      shortName: competition.shortName,
      area: competition.area,
      shape: competition.shape as 'LEAGUE' | 'KNOCKOUT',
      season: competition.season,
    },
    standings: (standings.results ?? []).map((row) => ({
      position: row.position,
      teamId: row.team_id,
      teamName: row.team_name,
      teamCrest: row.team_crest,
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      goalsFor: row.goals_for,
      goalsAgainst: row.goals_against,
      goalDifference: row.goal_difference,
      points: row.points,
      form: row.form ? row.form.split(',').filter(Boolean) : [],
    })),
    recentResults: (recent.results ?? []).map(toMatch),
    upcomingFixtures: (upcoming.results ?? []).map(toMatch),
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    // Anything other than a read is refused before routing, so a future edit
    // cannot accidentally introduce a write path.
    if (request.method !== 'GET') {
      return json({ ok: false, error: 'This API is read-only.' }, 405)
    }

    try {
      if (pathname === '/api/health') {
        return json({
          ok: true,
          schemaVersion: SCHEMA_VERSION,
          environment: env.ENVIRONMENT ?? 'unknown',
          readOnly: true,
        })
      }

      if (pathname === '/api/sync-status') {
        const status = await getSyncStatus(env)
        return json(envelope(status, status.lastRunAt))
      }

      if (pathname === '/api/competitions/snapshots') {
        const status = await getSyncStatus(env)
        const snapshots = []

        for (const competition of TRACKED_COMPETITIONS) {
          const snapshot = await getSnapshot(env, competition.code)
          if (snapshot) snapshots.push(snapshot)
        }

        return json(envelope(snapshots, status.lastRunAt))
      }

      const single = pathname.match(/^\/api\/competitions\/([A-Za-z0-9]+)$/)
      if (single) {
        const status = await getSyncStatus(env)
        const snapshot = await getSnapshot(env, single[1].toUpperCase())

        if (!snapshot) {
          return json({ ok: false, error: 'Competition not tracked.' }, 404)
        }

        return json(envelope(snapshot, status.lastRunAt))
      }

      return json({ ok: false, error: 'Not found.' }, 404)
    } catch (error) {
      console.error('Request failed', error)
      return json({ ok: false, error: 'Internal error.' }, 500)
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // The scheduled time, not the wall clock: it is what decides whether this
    // run uses the match window or reconciles the full season, and it stays
    // correct if an invocation is delivered late.
    ctx.waitUntil(
      runScheduledSync(env, new Date(event.scheduledTime)).then((summary) => {
        const w = summary.writes

        // Written counts are logged rather than stored: persisting them needs
        // a schema change, and this change ships without one. `matches` below
        // is what the run COVERED; `wrote` is what it actually changed, and on
        // a healthy quiet run that second number is 0.
        console.log(
          `sync competitions=${summary.competitions.join(',')} ` +
            `matches=${summary.matchesIngested} standings=${summary.standingsIngested} ` +
            `unresolved=${summary.unresolved} errors=${summary.errors.length} ` +
            `wrote=${
              w.matchesInserted +
              w.matchesUpdated +
              w.standingsInserted +
              w.standingsUpdated +
              w.standingsRemoved +
              w.competitionsWritten
            } ` +
            `matchIns=${w.matchesInserted} matchUpd=${w.matchesUpdated} ` +
            `matchSame=${w.matchesUnchanged} standIns=${w.standingsInserted} ` +
            `standUpd=${w.standingsUpdated} standDel=${w.standingsRemoved} ` +
            `standSame=${w.standingsUnchanged} compWrote=${w.competitionsWritten}`,
        )
      }),
    )
  },
}
