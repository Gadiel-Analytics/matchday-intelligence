import { describe, expect, it } from 'vitest'
import { ROTATION_SIZE, TRACKED_COMPETITIONS, selectRotation, seasonLabel, normaliseMatch } from '../../../worker/src/sync'
import type { FdMatch } from '../../../worker/src/sync'

describe('selectRotation', () => {
  it('covers every competition exactly once per full cycle', () => {
    const cycles = TRACKED_COMPETITIONS.length / ROTATION_SIZE
    const seen = Array.from({ length: cycles }, (_, index) => selectRotation(index)).flat()

    expect(seen).toHaveLength(TRACKED_COMPETITIONS.length)
    expect(new Set(seen.map((entry) => entry.code)).size).toBe(TRACKED_COMPETITIONS.length)
  })

  it('wraps around rather than running off the end', () => {
    const cycles = TRACKED_COMPETITIONS.length / ROTATION_SIZE
    expect(selectRotation(cycles)).toEqual(selectRotation(0))
  })

  it('stays within the feed rate ceiling', () => {
    // Two endpoints per competition, ten requests per minute allowed.
    expect(selectRotation(0).length * 2).toBeLessThanOrEqual(10)
  })
})

describe('seasonLabel', () => {
  it('formats a cross-year season', () => {
    expect(seasonLabel('2026-08-22', '2027-05-30')).toBe('2026/27')
  })

  it('formats a single-year season', () => {
    expect(seasonLabel('2026-06-11', '2026-07-19')).toBe('2026')
  })

  it('admits when it does not know', () => {
    expect(seasonLabel(undefined, undefined)).toBe('unknown')
  })
})

const feedMatch = (over: Partial<FdMatch> = {}): FdMatch => ({
  id: 501,
  utcDate: '2026-08-22T14:00:00Z',
  status: 'FINISHED',
  matchday: 1,
  homeTeam: { id: 57, shortName: 'Arsenal' },
  awayTeam: { id: 65, shortName: 'Man City' },
  score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } },
  ...over,
})

describe('normaliseMatch', () => {
  it('keys on the feed id and carries both team ids', () => {
    const row = normaliseMatch(feedMatch(), 'PL')

    expect(row).not.toBeNull()
    expect(row!.id).toBe(501)
    expect(row!.homeTeamId).toBe(57)
    expect(row!.awayTeamId).toBe(65)
    expect(row!.homeScore).toBe(2)
  })

  it('stores no score for a fixture that has not finished', () => {
    const row = normaliseMatch(
      feedMatch({ status: 'TIMED', score: { winner: null, fullTime: { home: null, away: null } } }),
      'PL',
    )

    // Null, not zero: "not played" is a different claim from "goalless".
    expect(row!.homeScore).toBeNull()
    expect(row!.awayScore).toBeNull()
  })

  it('returns null when the row cannot be keyed', () => {
    expect(normaliseMatch(feedMatch({ homeTeam: {} as never }), 'PL')).toBeNull()
    expect(normaliseMatch(feedMatch({ id: 0 as never }), 'PL')).toBeNull()
  })

  it('survives a team named only by its long form', () => {
    const row = normaliseMatch(
      feedMatch({ homeTeam: { id: 108, name: 'FC Internazionale Milano' } }),
      'SA',
    )

    // No name table to miss: the id is the key, the name is just a label.
    expect(row!.homeTeamId).toBe(108)
    expect(row!.homeTeamName).toBe('FC Internazionale Milano')
  })
})
