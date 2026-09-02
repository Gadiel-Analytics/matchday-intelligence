import { describe, expect, it } from 'vitest'
import {
  RECONCILIATION_END_HOUR_UTC,
  computeWindow,
  normaliseMatch,
  normaliseStanding,
  planCompetitionWrite,
  planMatchWrites,
  planStandingWrites,
  matchColumns,
  standingColumns,
  readTotalStandings,
  selectScope,
} from '../../../worker/src/sync'
import type {
  FdMatch,
  FdStanding,
  MatchColumns,
  NormalisedMatch,
  NormalisedStanding,
  StandingColumns,
} from '../../../worker/src/sync'

/* -------------------------------------------------------------------------
   Fixtures
------------------------------------------------------------------------- */

const feedMatch = (over: Partial<FdMatch> = {}): FdMatch => ({
  id: 501,
  utcDate: '2026-09-12T14:00:00Z',
  status: 'TIMED',
  matchday: 4,
  homeTeam: { id: 57, shortName: 'Arsenal' },
  awayTeam: { id: 65, shortName: 'Man City' },
  score: { winner: null, fullTime: { home: null, away: null } },
  ...over,
})

const feedStanding = (over: Partial<FdStanding> = {}): FdStanding => ({
  position: 1,
  team: { id: 57, shortName: 'Arsenal' },
  playedGames: 4,
  won: 3,
  draw: 1,
  lost: 0,
  goalsFor: 9,
  goalsAgainst: 2,
  goalDifference: 7,
  points: 10,
  form: 'W,W,D,W',
  ...over,
})

const match = (over: Partial<FdMatch> = {}): NormalisedMatch =>
  normaliseMatch(feedMatch(over), 'PL') as NormalisedMatch

const standing = (over: Partial<FdStanding> = {}): NormalisedStanding =>
  normaliseStanding(feedStanding(over), 'PL') as NormalisedStanding

const storedFrom = (rows: NormalisedMatch[]): Map<number, MatchColumns> =>
  new Map(rows.map((row) => [row.id, matchColumns(row)]))

const storedStandingsFrom = (
  rows: NormalisedStanding[],
): Map<number, StandingColumns> =>
  new Map(rows.map((row) => [row.teamId, standingColumns(row)]))

/* -------------------------------------------------------------------------
   Idempotence — the property the whole change exists to create
------------------------------------------------------------------------- */

describe('planMatchWrites', () => {
  it('writes nothing when the feed repeats what is already stored', () => {
    const rows = [match(), match({ id: 502 }), match({ id: 503 })]
    const plan = planMatchWrites(rows, storedFrom(rows))

    expect(plan.inserts).toHaveLength(0)
    expect(plan.updates).toHaveLength(0)
    expect(plan.unchanged).toBe(3)
    expect(plan.compared).toBe(3)
  })

  it('inserts a match it has never seen', () => {
    const plan = planMatchWrites([match({ id: 999 })], storedFrom([match()]))

    expect(plan.inserts).toHaveLength(1)
    expect(plan.inserts[0].id).toBe(999)
    expect(plan.updates).toHaveLength(0)
  })

  it('updates only the score columns when a result arrives', () => {
    const before = match()
    const after = match({
      status: 'FINISHED',
      score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } },
    })

    const plan = planMatchWrites([after], storedFrom([before]))

    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0].changed).toEqual({
      status: 'FINISHED',
      home_score: 2,
      away_score: 1,
    })
  })

  it('leaves kickoff_utc out of the SET list when the kickoff did not move', () => {
    const after = match({
      status: 'FINISHED',
      score: { winner: 'DRAW', fullTime: { home: 1, away: 1 } },
    })
    const plan = planMatchWrites([after], storedFrom([match()]))

    // Both secondary indexes cover kickoff_utc or status. Naming a column in
    // SET rewrites its index entry whether or not the value moved, so an
    // unchanged kickoff must not appear here.
    expect(plan.updates[0].changed).not.toHaveProperty('kickoff_utc')
    expect(Object.keys(plan.updates[0].changed).sort()).toEqual([
      'away_score',
      'home_score',
      'status',
    ])
  })

  it('writes kickoff_utc when a fixture is genuinely rescheduled', () => {
    const moved = match({ utcDate: '2026-09-13T18:30:00Z' })
    const plan = planMatchWrites([moved], storedFrom([match()]))

    expect(plan.updates[0].changed).toEqual({ kickoff_utc: '2026-09-13T18:30:00Z' })
  })

  it('keeps null scores distinct from a goalless draw', () => {
    const goalless = match({
      status: 'FINISHED',
      score: { winner: 'DRAW', fullTime: { home: 0, away: 0 } },
    })

    // stored: not played yet (null, null). incoming: finished 0-0.
    const plan = planMatchWrites([goalless], storedFrom([match()]))
    expect(plan.updates[0].changed).toEqual({
      status: 'FINISHED',
      home_score: 0,
      away_score: 0,
    })

    // and the reverse comparison must not treat 0 as equal to null either
    const backwards = planMatchWrites([match()], storedFrom([goalless]))
    expect(backwards.updates[0].changed).toEqual({
      status: 'TIMED',
      home_score: null,
      away_score: null,
    })
  })

  it('never plans a deletion for matches', () => {
    // Window runs read a slice; a fixture missing from the slice has not been
    // cancelled, it is merely out of scope. Deleting on absence would destroy
    // the season outside the window on every run.
    const plan = planMatchWrites([], storedFrom([match(), match({ id: 502 })]))

    expect(plan).not.toHaveProperty('removals')
    expect(plan.inserts).toHaveLength(0)
    expect(plan.updates).toHaveLength(0)
  })
})

/* -------------------------------------------------------------------------
   Standings
------------------------------------------------------------------------- */

describe('planStandingWrites', () => {
  it('writes nothing when the table has not moved', () => {
    const rows = [standing(), standing({ position: 2, team: { id: 65 } })]
    const plan = planStandingWrites(rows, storedStandingsFrom(rows))

    expect(plan.inserts).toHaveLength(0)
    expect(plan.updates).toHaveLength(0)
    expect(plan.removals).toHaveLength(0)
    expect(plan.unchanged).toBe(2)
  })

  it('updates only the columns that moved after a result', () => {
    const after = standing({ playedGames: 5, won: 4, points: 13, goalsFor: 11, goalDifference: 9 })
    const plan = planStandingWrites([after], storedStandingsFrom([standing()]))

    expect(plan.updates).toHaveLength(1)
    expect(Object.keys(plan.updates[0].changed).sort()).toEqual([
      'goal_difference',
      'goals_for',
      'played',
      'points',
      'won',
    ])
  })

  it('removes a team the authoritative table no longer lists', () => {
    const stored = storedStandingsFrom([
      standing(),
      standing({ team: { id: 65 }, position: 2 }),
    ])
    const plan = planStandingWrites([standing()], stored)

    expect(plan.removals).toEqual([65])
    expect(plan.unchanged).toBe(1)
  })

  it('inserts a promoted team without touching the rest', () => {
    const plan = planStandingWrites(
      [standing(), standing({ team: { id: 402 }, position: 2 })],
      storedStandingsFrom([standing()]),
    )

    expect(plan.inserts).toHaveLength(1)
    expect(plan.inserts[0].team_id).toBe(402)
    expect(plan.updates).toHaveLength(0)
    expect(plan.removals).toHaveLength(0)
  })
})

/* -------------------------------------------------------------------------
   The guard: a provider hiccup is not an authoritative empty league
------------------------------------------------------------------------- */

describe('readTotalStandings', () => {
  it('accepts a populated TOTAL table', () => {
    const check = readTotalStandings(
      { standings: [{ type: 'TOTAL', table: [feedStanding()] }] },
      'PL',
    )

    expect(check.ok).toBe(true)
    if (check.ok) expect(check.rows).toHaveLength(1)
  })

  it.each([
    ['no payload at all', undefined],
    ['no standings array', {}],
    ['standings present but no TOTAL table', { standings: [{ type: 'HOME', table: [feedStanding()] }] }],
    ['TOTAL present but table missing', { standings: [{ type: 'TOTAL' }] }],
    ['TOTAL present but table empty', { standings: [{ type: 'TOTAL', table: [] }] }],
    ['TOTAL rows carry no team id', { standings: [{ type: 'TOTAL', table: [{ ...feedStanding(), team: {} } as FdStanding] }] }],
  ])('rejects %s rather than emptying the stored table', (_label, payload) => {
    const check = readTotalStandings(payload as never, 'PL')

    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toBeTruthy()
  })

  it('a rejected payload can produce no destructive plan, because no rows reach one', () => {
    const stored = storedStandingsFrom([standing(), standing({ team: { id: 65 } })])
    const check = readTotalStandings({ standings: [{ type: 'TOTAL', table: [] }] }, 'PL')

    expect(check.ok).toBe(false)

    // Guarding at the payload is what matters: had the empty table been let
    // through, the plan would have removed every stored row.
    const hypothetical = planStandingWrites([], stored)
    expect(hypothetical.removals).toHaveLength(2)
  })
})

/* -------------------------------------------------------------------------
   Competition metadata
------------------------------------------------------------------------- */

describe('planCompetitionWrite', () => {
  const columns = {
    name: 'Premier League',
    short_name: 'Premier League',
    area: 'England',
    shape: 'LEAGUE',
    season: '2026/27',
  }

  it('inserts when the competition is not stored yet', () => {
    expect(planCompetitionWrite(columns, null)).toEqual({ kind: 'insert', columns })
  })

  it('writes nothing when the metadata is identical', () => {
    expect(planCompetitionWrite(columns, { ...columns })).toEqual({ kind: 'unchanged' })
  })

  it('updates only the season when the season rolls over', () => {
    const plan = planCompetitionWrite(columns, { ...columns, season: '2025/26' })

    expect(plan).toEqual({ kind: 'update', changed: { season: '2026/27' } })
  })
})

/* -------------------------------------------------------------------------
   Scope and window
------------------------------------------------------------------------- */

describe('computeWindow', () => {
  it('spans the configured days either side of the run date', () => {
    expect(computeWindow(new Date('2026-09-12T14:00:00Z'))).toEqual({
      dateFrom: '2026-09-09',
      dateTo: '2026-09-26',
      storedUpperExclusive: '2026-09-27',
    })
  })

  it('carries across a month boundary', () => {
    expect(computeWindow(new Date('2026-09-01T00:05:00Z'))).toMatchObject({
      dateFrom: '2026-08-29',
      dateTo: '2026-09-15',
    })
  })

  it('carries across a year boundary', () => {
    expect(computeWindow(new Date('2026-12-31T23:59:00Z'))).toMatchObject({
      dateFrom: '2026-12-28',
      dateTo: '2027-01-14',
    })
  })

  it('carries across a leap day', () => {
    expect(computeWindow(new Date('2028-03-01T09:00:00Z'))).toMatchObject({
      dateFrom: '2028-02-27',
      dateTo: '2028-03-15',
    })
  })

  it('sets the stored upper bound one day past dateTo so the final day is whole', () => {
    const window = computeWindow(new Date('2026-09-12T14:00:00Z'))

    // A kickoff late on dateTo must still fall inside the read range.
    expect('2026-09-26T20:00:00Z' < window.storedUpperExclusive).toBe(true)
    expect('2026-09-27T12:00:00Z' < window.storedUpperExclusive).toBe(false)
    expect('2026-09-09T11:30:00Z' >= window.dateFrom).toBe(true)
    expect('2026-09-08T23:59:00Z' >= window.dateFrom).toBe(false)
  })
})

describe('selectScope', () => {
  it('reconciles the full season on overnight runs', () => {
    for (const hour of [0, 2, 4, 6, 8, 10]) {
      const now = new Date(Date.UTC(2026, 8, 12, hour, 0, 0))
      expect(selectScope(now)).toEqual({ kind: 'season' })
    }
  })

  it('uses the match window during the match window', () => {
    for (const hour of [11, 15, 19, 23]) {
      const now = new Date(Date.UTC(2026, 8, 12, hour, 0, 0))
      expect(selectScope(now).kind).toBe('window')
    }
  })

  it('switches exactly at the documented hour', () => {
    const before = new Date(Date.UTC(2026, 8, 12, RECONCILIATION_END_HOUR_UTC - 1, 59))
    const at = new Date(Date.UTC(2026, 8, 12, RECONCILIATION_END_HOUR_UTC, 0))

    expect(selectScope(before).kind).toBe('season')
    expect(selectScope(at).kind).toBe('window')
  })

  it('reconciliation compares the same way the window does', () => {
    // Scope changes what is fetched and read, never how a difference is judged.
    const rows = [match(), match({ id: 502 })]
    expect(planMatchWrites(rows, storedFrom(rows)).unchanged).toBe(2)

    const moved = match({ id: 502, utcDate: '2027-02-02T20:00:00Z' })
    const plan = planMatchWrites([match(), moved], storedFrom(rows))

    // A fixture that drifted far outside any window is repaired by the
    // overnight full-season pass, which is why no bootstrap path is needed.
    expect(plan.updates).toEqual([
      { id: 502, changed: { kickoff_utc: '2027-02-02T20:00:00Z' } },
    ])
  })
})
