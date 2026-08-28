import { describe, expect, it } from 'vitest'
import {
  calculateStandings,
  isTeamEliminated,
  pointsForTeamInMatch,
  totalPointsForTeam,
  winnerOf,
} from '../survivorScoring'
import {
  archiveAssignments,
  archiveMatches,
  archivePlayers,
  ARCHIVE_SCORING,
} from '../../data/wc2026Archive'
import type { ArchiveMatch } from '../../types/domain'

const match = (over: Partial<ArchiveMatch> = {}): ArchiveMatch => ({
  id: 'm',
  round: 'Round of 16',
  homeTeamId: 'home',
  awayTeamId: 'away',
  homeScore: 0,
  awayScore: 0,
  kickoffUtc: '2026-07-05T18:00:00.000Z',
  ...over,
})

describe('pointsForTeamInMatch', () => {
  it('awards win, goals and a clean sheet together', () => {
    // 3 (win) + 2 (goals) + 1 (clean sheet) = 6
    expect(pointsForTeamInMatch('home', match({ homeScore: 2, awayScore: 0 }))).toBe(6)
  })

  it('awards a draw with goals but no clean sheet', () => {
    // 1 (draw) + 1 (goal) = 2
    expect(pointsForTeamInMatch('home', match({ homeScore: 1, awayScore: 1 }))).toBe(2)
  })

  it('still credits goals scored in a defeat', () => {
    // 0 (loss) + 1 (goal) = 1
    expect(pointsForTeamInMatch('home', match({ homeScore: 1, awayScore: 3 }))).toBe(1)
  })

  it('gives a goalless draw a clean sheet to both sides', () => {
    expect(pointsForTeamInMatch('home', match())).toBe(2)
    expect(pointsForTeamInMatch('away', match())).toBe(2)
  })

  it('ignores a team that did not play', () => {
    expect(pointsForTeamInMatch('other', match({ homeScore: 5, awayScore: 0 }))).toBe(0)
  })

  it('excludes matches before the cutoff', () => {
    const beforeCutoff = match({
      homeScore: 4,
      awayScore: 0,
      kickoffUtc: '2026-06-28T18:00:00.000Z',
    })
    expect(pointsForTeamInMatch('home', beforeCutoff)).toBe(0)
  })

  it('includes a match exactly on the cutoff boundary', () => {
    const onCutoff = match({ homeScore: 1, awayScore: 0, kickoffUtc: ARCHIVE_SCORING.cutoffUtc })
    expect(pointsForTeamInMatch('home', onCutoff)).toBe(5)
  })
})

describe('isTeamEliminated', () => {
  it('eliminates the loser and keeps the winner alive', () => {
    const matches = [match({ homeScore: 0, awayScore: 1 })]
    expect(isTeamEliminated('home', matches)).toBe(true)
    expect(isTeamEliminated('away', matches)).toBe(false)
  })

  it('keeps both alive on a draw, since a knockout draw is resolved elsewhere', () => {
    const matches = [match({ homeScore: 1, awayScore: 1 })]
    expect(isTeamEliminated('home', matches)).toBe(false)
    expect(isTeamEliminated('away', matches)).toBe(false)
  })

  it('treats a shootout encoded as the scoreline as a real elimination', () => {
    // Switzerland 4-3 Colombia was decided on penalties and stored that way,
    // which is precisely what lets the engine resolve it with no special case.
    const matches = [match({ homeTeamId: 'sui', awayTeamId: 'col', homeScore: 4, awayScore: 3 })]
    expect(isTeamEliminated('col', matches)).toBe(true)
    expect(isTeamEliminated('sui', matches)).toBe(false)
  })
})

describe('totalPointsForTeam', () => {
  it('accumulates across rounds', () => {
    const matches = [
      match({ id: 'a', homeTeamId: 'x', homeScore: 2, awayScore: 0 }), // 6
      match({ id: 'b', homeTeamId: 'x', homeScore: 1, awayScore: 2 }), // 1
    ]
    expect(totalPointsForTeam('x', matches)).toBe(7)
  })
})

describe('calculateStandings — against the frozen archive', () => {
  const standings = calculateStandings(archivePlayers, archiveAssignments, archiveMatches)

  it('ranks every participant exactly once', () => {
    expect(standings).toHaveLength(archivePlayers.length)
    expect(new Set(standings.map((row) => row.playerId)).size).toBe(archivePlayers.length)
  })

  it('orders by points descending', () => {
    const points = standings.map((row) => row.points)
    expect([...points].sort((a, b) => b - a)).toEqual(points)
  })

  it('assigns sequential ranks starting at one', () => {
    expect(standings.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('is won by the participant holding the champion', () => {
    // Spain won the final, so its owner tops the table.
    const winner = standings[0]
    expect(winner.teamIds).toContain('spain')
  })

  it('leaves nobody alive once the tournament is complete', () => {
    // Every team has lost except the champion, whose owner is the only one
    // that can still be 'alive'.
    const alive = standings.filter((row) => row.state === 'alive')
    expect(alive).toHaveLength(1)
    expect(alive[0].teamIds).toContain('spain')
  })
})

describe('winnerOf', () => {
  it('returns the higher-scoring side, or null when level', () => {
    expect(winnerOf(match({ homeScore: 2, awayScore: 1 }))).toBe('home')
    expect(winnerOf(match({ homeScore: 1, awayScore: 2 }))).toBe('away')
    expect(winnerOf(match({ homeScore: 1, awayScore: 1 }))).toBeNull()
  })
})
