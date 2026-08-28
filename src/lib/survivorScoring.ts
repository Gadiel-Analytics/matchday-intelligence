import type {
  ArchiveAssignment,
  ArchiveMatch,
  ArchivePlayer,
  ArchiveStanding,
} from '../types/domain'
import { ARCHIVE_SCORING } from '../data/wc2026Archive'

/**
 * Survivor scoring engine.
 *
 * Carried over from the production system with its behaviour unchanged; the
 * only edits are to the data shape it reads. It is a pure function of
 * (players, assignments, matches) with no I/O, which is what made it testable
 * against realistic snapshots during the live tournament and what makes the
 * archive reproducible now.
 *
 * Two rules do the real work:
 *   - points count only from the cutoff onward, so qualifying-stage form never
 *     leaks into a knockout-only competition;
 *   - a team is out the moment it loses a finished match, and a participant is
 *     out only when every team they hold is out.
 */

interface ScoringRules {
  win: number
  draw: number
  loss: number
  perGoal: number
  cleanSheet: number
  cutoffUtc: string
}

/** Points a single team earned in a single finished match. */
export function pointsForTeamInMatch(
  teamId: string,
  match: ArchiveMatch,
  rules: ScoringRules = ARCHIVE_SCORING,
): number {
  const isHome = match.homeTeamId === teamId
  const isAway = match.awayTeamId === teamId

  if (!isHome && !isAway) return 0
  if (match.kickoffUtc < rules.cutoffUtc) return 0

  const scored = isHome ? match.homeScore : match.awayScore
  const conceded = isHome ? match.awayScore : match.homeScore

  const outcome =
    scored > conceded ? rules.win : scored === conceded ? rules.draw : rules.loss

  return outcome + scored * rules.perGoal + (conceded === 0 ? rules.cleanSheet : 0)
}

/**
 * True once the team has lost a match inside the scored window.
 *
 * Note this reads elimination from results rather than from a stored flag. A
 * flag can drift when a score is corrected; a derivation cannot.
 */
export function isTeamEliminated(
  teamId: string,
  matches: ArchiveMatch[],
  rules: ScoringRules = ARCHIVE_SCORING,
): boolean {
  return matches.some((match) => {
    if (match.kickoffUtc < rules.cutoffUtc) return false

    const isHome = match.homeTeamId === teamId
    const isAway = match.awayTeamId === teamId
    if (!isHome && !isAway) return false

    const scored = isHome ? match.homeScore : match.awayScore
    const conceded = isHome ? match.awayScore : match.homeScore

    return scored < conceded
  })
}

export function totalPointsForTeam(
  teamId: string,
  matches: ArchiveMatch[],
  rules: ScoringRules = ARCHIVE_SCORING,
): number {
  return matches.reduce((sum, match) => sum + pointsForTeamInMatch(teamId, match, rules), 0)
}

/**
 * Final table: points descending, then surviving-team count descending so a
 * participant still in the tournament outranks an equal-scoring one who is out.
 */
export function calculateStandings(
  players: ArchivePlayer[],
  assignments: ArchiveAssignment[],
  matches: ArchiveMatch[],
  rules: ScoringRules = ARCHIVE_SCORING,
): ArchiveStanding[] {
  const rows = players.map((player) => {
    const teamIds = assignments
      .filter((assignment) => assignment.playerId === player.id)
      .map((assignment) => assignment.teamId)

    const points = teamIds.reduce(
      (sum, teamId) => sum + totalPointsForTeam(teamId, matches, rules),
      0,
    )

    const aliveCount = teamIds.filter(
      (teamId) => !isTeamEliminated(teamId, matches, rules),
    ).length

    return {
      playerId: player.id,
      points,
      teamIds,
      aliveCount,
      state: (teamIds.length === 0
        ? 'eliminated'
        : aliveCount > 0
          ? 'alive'
          : 'eliminated') as 'alive' | 'eliminated',
    }
  })

  rows.sort((a, b) => b.points - a.points || b.aliveCount - a.aliveCount)

  return rows.map((row, index) => ({
    rank: index + 1,
    playerId: row.playerId,
    points: row.points,
    state: row.state,
    teamIds: row.teamIds,
  }))
}

/** Winner of a finished match, or null for a draw. */
export function winnerOf(match: ArchiveMatch): string | null {
  if (match.homeScore > match.awayScore) return match.homeTeamId
  if (match.awayScore > match.homeScore) return match.awayTeamId
  return null
}
