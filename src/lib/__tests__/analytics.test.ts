import { describe, expect, it } from 'vitest'
import {
  competitionMetrics,
  findUpsets,
  formPoints,
  isFinished,
  rankByCompetitiveness,
} from '../analytics'
import type { CompetitionSnapshot, Match, StandingRow } from '../../types/domain'

const team = (id: number, points: number, position: number): StandingRow => ({
  position,
  teamId: id,
  teamName: `Team ${id}`,
  teamCrest: null,
  played: 3,
  won: 1,
  drawn: 0,
  lost: 2,
  goalsFor: 3,
  goalsAgainst: 4,
  goalDifference: -1,
  points,
  form: [],
})

const played = (home: number, away: number, homeScore: number, awayScore: number): Match => ({
  id: home * 1000 + away,
  competitionCode: 'PL',
  matchday: 1,
  stage: null,
  kickoffUtc: '2026-08-22T14:00:00.000Z',
  status: 'FINISHED',
  homeTeamId: home,
  homeTeamName: `Team ${home}`,
  homeTeamCrest: null,
  awayTeamId: away,
  awayTeamName: `Team ${away}`,
  awayTeamCrest: null,
  homeScore,
  awayScore,
})

const snapshot = (over: Partial<CompetitionSnapshot> = {}): CompetitionSnapshot => ({
  competition: {
    code: 'PL',
    name: 'Premier League',
    shortName: 'Premier League',
    area: 'England',
    shape: 'LEAGUE',
    season: '2026/27',
  },
  standings: [team(1, 9, 1), team(2, 6, 2), team(3, 3, 3)],
  recentResults: [played(1, 2, 2, 0), played(3, 1, 1, 1), played(2, 3, 0, 3)],
  upcomingFixtures: [],
  ...over,
})

describe('isFinished', () => {
  it('requires both a FINISHED status and two scores', () => {
    expect(isFinished(played(1, 2, 1, 0))).toBe(true)
    expect(isFinished({ ...played(1, 2, 1, 0), status: 'SCHEDULED' })).toBe(false)
    expect(isFinished({ ...played(1, 2, 1, 0), homeScore: null })).toBe(false)
  })
})

describe('competitionMetrics', () => {
  it('derives rates from finished matches only', () => {
    const metrics = competitionMetrics(snapshot())

    expect(metrics.matchesPlayed).toBe(3)
    // (2+0) + (1+1) + (0+3) = 7 goals over 3 matches
    expect(metrics.goalsPerMatch).toBeCloseTo(7 / 3)
    expect(metrics.drawRate).toBeCloseTo(1 / 3)
    expect(metrics.homeWinRate).toBeCloseTo(1 / 3)
  })

  it('reports spread, range and leader margin from the table', () => {
    const metrics = competitionMetrics(snapshot())

    expect(metrics.pointsRange).toBe(6)
    expect(metrics.leaderMargin).toBe(3)
    // Population sd of [9, 6, 3] is sqrt(6) ≈ 2.449
    expect(metrics.pointsSpread).toBeCloseTo(Math.sqrt(6))
  })

  it('returns null rather than zero when nothing has been played', () => {
    const metrics = competitionMetrics(snapshot({ recentResults: [], standings: [] }))

    expect(metrics.matchesPlayed).toBe(0)
    expect(metrics.goalsPerMatch).toBeNull()
    expect(metrics.drawRate).toBeNull()
    expect(metrics.pointsSpread).toBeNull()
    expect(metrics.leaderMargin).toBeNull()
  })

  it('ignores unfinished fixtures when computing rates', () => {
    const withFixture = snapshot({
      recentResults: [played(1, 2, 2, 0), { ...played(2, 3, 0, 0), status: 'SCHEDULED', homeScore: null, awayScore: null }],
    })

    expect(competitionMetrics(withFixture).matchesPlayed).toBe(1)
  })
})

describe('rankByCompetitiveness', () => {
  it('orders by tightest table first and holds out the uncomputable', () => {
    const tight = competitionMetrics(
      snapshot({ standings: [team(1, 5, 1), team(2, 4, 2), team(3, 4, 3)] }),
    )
    const spread = competitionMetrics(snapshot())
    const empty = competitionMetrics(snapshot({ recentResults: [], standings: [] }))

    const { computable, notComputable } = rankByCompetitiveness([spread, empty, tight])

    expect(computable[0].pointsSpread).toBeLessThan(computable[1].pointsSpread!)
    expect(notComputable).toHaveLength(1)
    expect(computable).toHaveLength(2)
  })
})

describe('formPoints', () => {
  it('scores a form string three for a win and one for a draw', () => {
    expect(formPoints(['W', 'W', 'D', 'L', 'W'])).toBe(10)
    expect(formPoints([])).toBe(0)
  })
})

describe('findUpsets', () => {
  it('flags a win by a side well below its opponent', () => {
    const standings = [team(1, 30, 1), team(2, 10, 12)]
    // Team 2 (12th) beats Team 1 (1st) away — an 11-place gap.
    const upsets = findUpsets([played(1, 2, 0, 2)], standings, 6)
    expect(upsets).toHaveLength(1)
  })

  it('ignores a result between neighbours', () => {
    const standings = [team(1, 30, 1), team(2, 28, 2)]
    expect(findUpsets([played(1, 2, 0, 2)], standings, 6)).toHaveLength(0)
  })

  it('ignores teams missing from the table', () => {
    expect(findUpsets([played(1, 99, 0, 2)], [team(1, 30, 1)], 6)).toHaveLength(0)
  })
})
