import { describe, expect, it } from 'vitest'
import {
  RECONCILIATION_END_HOUR_UTC,
  computeWindow,
  normaliseMatch,
  normaliseStanding,
  planCompetitionWrite,
  planMatchWrites,
  planStandingWrites,
  planStandingsTransition,
  decideStandings,
  resolveSeason,
  UNKNOWN_SEASON,
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
  const table = (rows: FdStanding[]) => ({ standings: [{ type: 'TOTAL', table: rows }] })

  const fullTable = (count = 20) =>
    Array.from({ length: count }, (_, index) =>
      feedStanding({ position: index + 1, team: { id: 100 + index } }),
    )

  it('accepts a populated, well-formed TOTAL table', () => {
    const check = readTotalStandings(table(fullTable()), 'PL')

    expect(check.ok).toBe(true)
    if (check.ok) expect(check.rows).toHaveLength(20)
  })

  it.each([
    ['no payload at all', undefined],
    ['no standings array', {}],
    ['standings present but no TOTAL table', { standings: [{ type: 'HOME', table: [feedStanding()] }] }],
    ['TOTAL present but table missing', { standings: [{ type: 'TOTAL' }] }],
    ['TOTAL present but table empty', table([])],
  ])('rejects %s rather than emptying the stored table', (_label, payload) => {
    const check = readTotalStandings(payload as never, 'PL')

    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toBeTruthy()
  })

  // The failure mode that matters: structurally broken payloads must not be
  // salvaged into a shorter table, because a shorter table means deletions.
  it('rejects a mostly-valid table containing one row without a team id', () => {
    const rows = fullTable()
    rows[7] = { ...feedStanding(), team: {} } as FdStanding

    const check = readTotalStandings(table(rows), 'PL')

    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toMatch(/team id/)
  })

  it('does not silently filter a malformed row down to a shorter usable table', () => {
    const rows = fullTable()
    rows[0] = { ...feedStanding(), team: {} } as FdStanding

    const check = readTotalStandings(table(rows), 'PL')

    // 19 salvageable rows is exactly what must NOT come back.
    expect(check).not.toHaveProperty('rows')
  })

  it('rejects a table that lists the same team twice', () => {
    const rows = fullTable()
    rows[5] = feedStanding({ position: 6, team: { id: rows[4].team.id } })

    const check = readTotalStandings(table(rows), 'PL')

    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toMatch(/more than once/)
  })

  it('gives a rejected payload no rows, so no write plan can be built from one', () => {
    const check = readTotalStandings(table([]), 'PL')

    expect(check.ok).toBe(false)
    expect(check).not.toHaveProperty('rows')
  })
})

/* -------------------------------------------------------------------------
   The transition guard: cardinality, not a tuned percentage
------------------------------------------------------------------------- */

describe('planStandingsTransition', () => {
  const league = (ids: number[]) =>
    ids.map((id, index) => standing({ position: index + 1, team: { id } }))

  const twenty = Array.from({ length: 20 }, (_, index) => 100 + index)

  it('applies a table of equal cardinality', () => {
    const stored = storedStandingsFrom(league(twenty))
    const transition = planStandingsTransition(league(twenty), stored)

    expect(transition.ok).toBe(true)
    if (transition.ok) expect(transition.plan.unchanged).toBe(20)
  })

  it('allows promotion and relegation, where cardinality is preserved', () => {
    const stored = storedStandingsFrom(league(twenty))
    const next = league([...twenty.slice(0, 17), 900, 901, 902])

    const transition = planStandingsTransition(next, stored)

    expect(transition.ok).toBe(true)
    if (transition.ok) {
      expect(transition.plan.inserts.map((row) => row.team_id)).toEqual([900, 901, 902])
      expect(transition.plan.removals).toEqual([117, 118, 119])
    }
  })

  it('allows growth', () => {
    const stored = storedStandingsFrom(league(twenty.slice(0, 18)))
    const transition = planStandingsTransition(league(twenty), stored)

    expect(transition.ok).toBe(true)
    if (transition.ok) expect(transition.plan.inserts).toHaveLength(2)
  })

  it('refuses a single unexplained lost team', () => {
    const stored = storedStandingsFrom(league(twenty))
    const transition = planStandingsTransition(league(twenty.slice(0, 19)), stored)

    expect(transition.ok).toBe(false)
    if (!transition.ok) expect(transition.reason).toMatch(/19 teams against 20 stored/)
  })

  it('refuses a badly truncated table', () => {
    const stored = storedStandingsFrom(league(twenty))
    const transition = planStandingsTransition(league(twenty.slice(0, 3)), stored)

    expect(transition.ok).toBe(false)
  })

  it('produces no plan at all when it refuses, so nothing can reach execution', () => {
    const stored = storedStandingsFrom(league(twenty))
    const transition = planStandingsTransition(league(twenty.slice(0, 3)), stored)

    expect(transition).not.toHaveProperty('plan')

    // Without the guard this is what would have been applied.
    expect(planStandingWrites(league(twenty.slice(0, 3)), stored).removals).toHaveLength(17)
  })

  it('lets a competition populate from empty, so a new season can bootstrap', () => {
    const transition = planStandingsTransition(league(twenty), new Map())

    expect(transition.ok).toBe(true)
    if (transition.ok) expect(transition.plan.inserts).toHaveLength(20)
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
   Season trust — season may only advance from standings trusted end to end
------------------------------------------------------------------------- */

describe('season trust', () => {
  const teams = (count: number, from = 100) =>
    Array.from({ length: count }, (_, index) =>
      feedStanding({ position: index + 1, team: { id: from + index } }),
    )

  const payload = (rows: FdStanding[], startDate: string, endDate: string) => ({
    season: { startDate, endDate },
    standings: [{ type: 'TOTAL', table: rows }],
  })

  const NEW_SEASON = ['2027-08-14', '2028-05-24'] as const
  const stored20 = () =>
    storedStandingsFrom(
      teams(20).map((row) => standing({ position: row.position, team: row.team })),
    )

  it('refuses to advance the season when the new table has lost a team', () => {
    // The failure this guard exists for: a rollover payload that is
    // structurally perfect but covers 19 of 20 teams. Refusing the table
    // while accepting its season label would leave the competition reading
    // 2027/28 over a stale 2026/27 table.
    const decision = decideStandings(payload(teams(19), ...NEW_SEASON), 'PL', stored20())

    expect(decision.trusted).toBe(false)
    expect(resolveSeason(decision, '2026/27')).toBe('2026/27')
    expect(decision).not.toHaveProperty('season')
  })

  it('advances the season when the new table keeps its cardinality', () => {
    const decision = decideStandings(payload(teams(20), ...NEW_SEASON), 'PL', stored20())

    expect(decision.trusted).toBe(true)
    if (decision.trusted) expect(decision.season).toBe('2027/28')
    expect(resolveSeason(decision, '2026/27')).toBe('2027/28')
  })

  it('refuses to advance the season from a structurally invalid payload', () => {
    const broken = teams(20)
    broken[3] = { ...feedStanding(), team: {} } as FdStanding

    const decision = decideStandings(payload(broken, ...NEW_SEASON), 'PL', stored20())

    expect(decision.trusted).toBe(false)
    expect(resolveSeason(decision, '2026/27')).toBe('2026/27')
  })

  it('bootstraps a brand-new competition with the sentinel when standings are unusable', () => {
    // The parent row still has to exist: matches carry a foreign key onto it.
    const decision = decideStandings(payload([], ...NEW_SEASON), 'PL', new Map())

    expect(decision.trusted).toBe(false)
    expect(resolveSeason(decision, null)).toBe(UNKNOWN_SEASON)
  })

  it('leaves the stored season untouched in the competition write plan', () => {
    const columns = {
      name: 'Premier League',
      short_name: 'Premier League',
      area: 'England',
      shape: 'LEAGUE',
      season: '2026/27',
    }

    const decision = decideStandings(payload(teams(19), ...NEW_SEASON), 'PL', stored20())
    const season = resolveSeason(decision, columns.season)

    // No season column reaches the UPDATE, so nothing can relabel the table.
    expect(planCompetitionWrite({ ...columns, season }, columns)).toEqual({
      kind: 'unchanged',
    })
  })

  it('still maintains the manifest metadata while the season is withheld', () => {
    const stored = {
      name: 'Premier Leage',
      short_name: 'Premier League',
      area: 'England',
      shape: 'LEAGUE',
      season: '2026/27',
    }

    const decision = decideStandings(payload(teams(19), ...NEW_SEASON), 'PL', stored20())
    const season = resolveSeason(decision, stored.season)

    const plan = planCompetitionWrite(
      { ...stored, name: 'Premier League', season },
      stored,
    )

    expect(plan).toEqual({ kind: 'update', changed: { name: 'Premier League' } })
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
