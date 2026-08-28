import type { CompetitionSnapshot, Match, StandingRow } from '../types/domain'

/**
 * Derived competition analytics.
 *
 * The feed gives fixtures, results and tables. Everything here is computed on
 * top of that — it is the part a raw scoreboard does not give you, and the
 * reason this is a pipeline rather than a proxy.
 *
 * Every function returns `null` when the inputs cannot support the statistic
 * (no matches played, a single-team table). Returning 0 would be a claim, and
 * "nothing has happened yet" is not the same claim as "the value is zero".
 */

export interface CompetitionMetrics {
  code: string
  shortName: string
  /** Matches with a final score inside this season. */
  matchesPlayed: number
  /** Mean goals per finished match. Null before any match finishes. */
  goalsPerMatch: number | null
  /** Share of finished matches that ended level, 0–1. */
  drawRate: number | null
  /** Share of finished matches won by the home side, 0–1. */
  homeWinRate: number | null
  /**
   * Points spread across the table, expressed as the population standard
   * deviation of points. Lower means a tighter competition.
   */
  pointsSpread: number | null
  /** Points between first and last. Null with fewer than two teams. */
  pointsRange: number | null
  /** Points between first and second — the title-race margin. */
  leaderMargin: number | null
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const average = mean(values)
  const variance = mean(values.map((value) => (value - average) ** 2))
  return Math.sqrt(variance)
}

/** A match counts only once it has a final score in both columns. */
export function isFinished(match: Match): boolean {
  return match.status === 'FINISHED' && match.homeScore !== null && match.awayScore !== null
}

export function competitionMetrics(snapshot: CompetitionSnapshot): CompetitionMetrics {
  const finished = snapshot.recentResults.filter(isFinished)
  const table = snapshot.standings

  const played = finished.length
  const hasMatches = played > 0
  const hasTable = table.length > 1

  const goals = finished.reduce(
    (sum, match) => sum + (match.homeScore ?? 0) + (match.awayScore ?? 0),
    0,
  )
  const draws = finished.filter((match) => match.homeScore === match.awayScore).length
  const homeWins = finished.filter(
    (match) => (match.homeScore ?? 0) > (match.awayScore ?? 0),
  ).length

  const points = table.map((row) => row.points)
  const sortedPoints = [...points].sort((a, b) => b - a)

  return {
    code: snapshot.competition.code,
    shortName: snapshot.competition.shortName,
    matchesPlayed: played,
    goalsPerMatch: hasMatches ? goals / played : null,
    drawRate: hasMatches ? draws / played : null,
    homeWinRate: hasMatches ? homeWins / played : null,
    pointsSpread: hasTable ? standardDeviation(points) : null,
    pointsRange: hasTable ? sortedPoints[0] - sortedPoints[sortedPoints.length - 1] : null,
    leaderMargin: hasTable ? sortedPoints[0] - sortedPoints[1] : null,
  }
}

/**
 * Ranks competitions by how tightly packed their tables are.
 *
 * Competitions whose spread cannot be computed are excluded rather than
 * ranked last — an unknown is not a result.
 */
export function rankByCompetitiveness(
  metrics: CompetitionMetrics[],
): { computable: CompetitionMetrics[]; notComputable: CompetitionMetrics[] } {
  const computable = metrics
    .filter((metric) => metric.pointsSpread !== null && metric.matchesPlayed > 0)
    .sort((a, b) => (a.pointsSpread ?? 0) - (b.pointsSpread ?? 0))

  const notComputable = metrics.filter(
    (metric) => metric.pointsSpread === null || metric.matchesPlayed === 0,
  )

  return { computable, notComputable }
}

/** Recent form as points earned across a team's last N results. */
export function formPoints(form: string[]): number {
  return form.reduce((sum, result) => {
    if (result === 'W') return sum + 3
    if (result === 'D') return sum + 1
    return sum
  }, 0)
}

/**
 * A result is an upset when a side at least `gap` table positions below its
 * opponent wins. Position is taken from the table at read time, which is an
 * approximation — the table has since moved. Stated here rather than hidden.
 */
export function findUpsets(
  results: Match[],
  standings: StandingRow[],
  gap = 6,
): Match[] {
  const positionByTeam = new Map(standings.map((row) => [row.teamId, row.position]))

  return results.filter((match) => {
    if (!isFinished(match)) return false

    const homePosition = positionByTeam.get(match.homeTeamId)
    const awayPosition = positionByTeam.get(match.awayTeamId)
    if (homePosition === undefined || awayPosition === undefined) return false

    const homeWon = (match.homeScore ?? 0) > (match.awayScore ?? 0)
    const awayWon = (match.awayScore ?? 0) > (match.homeScore ?? 0)

    if (homeWon) return homePosition - awayPosition >= gap
    if (awayWon) return awayPosition - homePosition >= gap
    return false
  })
}
