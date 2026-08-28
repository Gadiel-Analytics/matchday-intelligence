import type {
  ArchiveAssignment,
  ArchiveMatch,
  ArchivePlayer,
  ArchiveTeam,
} from '../types/domain'

/**
 * FIFA World Cup 2026 survivor pool — frozen archive.
 *
 * This ran in production from 1–19 July 2026 with eight real participants. The
 * data below is the final state, exported once and committed as a static
 * fixture rather than read from a live table: a finished tournament should not
 * be able to drift, and a reader should be able to inspect the exact numbers
 * the case study is derived from.
 *
 * PARTICIPANT NAMES ARE PSEUDONYMOUS. The author (Gadiel) is named; the other
 * seven participants were private individuals and are represented by AI model
 * names. Team assignments, scores, points and outcomes are unmodified.
 */

export const ARCHIVE_SEASON = '2026'
export const ARCHIVE_WINDOW = { from: '2026-07-01', to: '2026-07-19' } as const

/** Points from the knockout stage only, counted from the 1 July cutoff. */
export const ARCHIVE_SCORING = {
  win: 3,
  draw: 1,
  loss: 0,
  perGoal: 1,
  cleanSheet: 1,
  cutoffUtc: '2026-07-01T00:00:00.000Z',
} as const

export const archivePlayers: ArchivePlayer[] = [
  { id: 'p01', displayName: 'Gadiel', colour: '#169cff' },
  { id: 'p02', displayName: 'Gemini', colour: '#ff4d7d' },
  { id: 'p03', displayName: 'Llama', colour: '#f4b844' },
  { id: 'p04', displayName: 'Mistral', colour: '#943dff' },
  { id: 'p05', displayName: 'Grok', colour: '#2bd4a3' },
  { id: 'p06', displayName: 'DeepSeek', colour: '#ff6b5a' },
  { id: 'p07', displayName: 'ChatGPT', colour: '#8d9ab1' },
  { id: 'p08', displayName: 'Claude', colour: '#4dd0e1' },
]

export const archiveTeams: ArchiveTeam[] = [
  { id: 'canada', name: 'Canada', flag: '🇨🇦' },
  { id: 'morocco', name: 'Morocco', flag: '🇲🇦' },
  { id: 'paraguay', name: 'Paraguay', flag: '🇵🇾' },
  { id: 'france', name: 'France', flag: '🇫🇷' },
  { id: 'brazil', name: 'Brazil', flag: '🇧🇷' },
  { id: 'norway', name: 'Norway', flag: '🇳🇴' },
  { id: 'mexico', name: 'Mexico', flag: '🇲🇽' },
  { id: 'england', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 'portugal', name: 'Portugal', flag: '🇵🇹' },
  { id: 'spain', name: 'Spain', flag: '🇪🇸' },
  { id: 'united-states', name: 'United States', flag: '🇺🇸' },
  { id: 'belgium', name: 'Belgium', flag: '🇧🇪' },
  { id: 'argentina', name: 'Argentina', flag: '🇦🇷' },
  { id: 'egypt', name: 'Egypt', flag: '🇪🇬' },
  { id: 'switzerland', name: 'Switzerland', flag: '🇨🇭' },
  { id: 'colombia', name: 'Colombia', flag: '🇨🇴' },
]

/**
 * Final ownership, after a mid-tournament reassignment.
 *
 * Two participants lost both teams in the Round of 16 while two placeholder
 * entrants still held live quarter-finalists. Rather than leave real people
 * spectating for two weeks, live teams were traded for already-eliminated ones.
 * The swap is recorded here as the final state and is discussed in the
 * decision log — it is a governance decision, not a data correction.
 */
export const archiveAssignments: ArchiveAssignment[] = [
  { playerId: 'p01', teamId: 'portugal' },
  { playerId: 'p01', teamId: 'norway' },
  { playerId: 'p02', teamId: 'england' },
  { playerId: 'p02', teamId: 'france' },
  { playerId: 'p03', teamId: 'argentina' },
  { playerId: 'p03', teamId: 'egypt' },
  { playerId: 'p04', teamId: 'brazil' },
  { playerId: 'p04', teamId: 'morocco' },
  { playerId: 'p05', teamId: 'united-states' },
  { playerId: 'p05', teamId: 'belgium' },
  { playerId: 'p06', teamId: 'spain' },
  { playerId: 'p06', teamId: 'switzerland' },
  { playerId: 'p07', teamId: 'colombia' },
  { playerId: 'p07', teamId: 'paraguay' },
  { playerId: 'p08', teamId: 'canada' },
  { playerId: 'p08', teamId: 'mexico' },
]

export const archiveMatches: ArchiveMatch[] = [
  // Round of 16 — 4–7 July 2026
  { id: 'r16-1', round: 'Round of 16', homeTeamId: 'canada', awayTeamId: 'morocco', homeScore: 0, awayScore: 3, kickoffUtc: '2026-07-04T17:00:00.000Z' },
  { id: 'r16-2', round: 'Round of 16', homeTeamId: 'paraguay', awayTeamId: 'france', homeScore: 0, awayScore: 1, kickoffUtc: '2026-07-04T21:00:00.000Z' },
  { id: 'r16-3', round: 'Round of 16', homeTeamId: 'brazil', awayTeamId: 'norway', homeScore: 1, awayScore: 2, kickoffUtc: '2026-07-05T20:00:00.000Z' },
  { id: 'r16-4', round: 'Round of 16', homeTeamId: 'mexico', awayTeamId: 'england', homeScore: 2, awayScore: 3, kickoffUtc: '2026-07-06T00:00:00.000Z' },
  { id: 'r16-5', round: 'Round of 16', homeTeamId: 'portugal', awayTeamId: 'spain', homeScore: 0, awayScore: 1, kickoffUtc: '2026-07-06T19:00:00.000Z' },
  { id: 'r16-6', round: 'Round of 16', homeTeamId: 'united-states', awayTeamId: 'belgium', homeScore: 1, awayScore: 4, kickoffUtc: '2026-07-07T00:00:00.000Z' },
  { id: 'r16-7', round: 'Round of 16', homeTeamId: 'argentina', awayTeamId: 'egypt', homeScore: 3, awayScore: 2, kickoffUtc: '2026-07-07T16:00:00.000Z' },
  {
    id: 'r16-8',
    round: 'Round of 16',
    homeTeamId: 'switzerland',
    awayTeamId: 'colombia',
    homeScore: 4,
    awayScore: 3,
    kickoffUtc: '2026-07-07T20:00:00.000Z',
    note: 'Decided on penalties. The shootout tally is stored as the scoreline — see decision log.',
  },

  // Quarter-finals — 9–11 July 2026
  { id: 'qf-1', round: 'Quarter-final', homeTeamId: 'france', awayTeamId: 'morocco', homeScore: 2, awayScore: 0, kickoffUtc: '2026-07-09T20:00:00.000Z' },
  { id: 'qf-2', round: 'Quarter-final', homeTeamId: 'spain', awayTeamId: 'belgium', homeScore: 2, awayScore: 1, kickoffUtc: '2026-07-10T19:00:00.000Z' },
  { id: 'qf-3', round: 'Quarter-final', homeTeamId: 'norway', awayTeamId: 'england', homeScore: 1, awayScore: 2, kickoffUtc: '2026-07-11T21:00:00.000Z', note: 'After extra time.' },
  { id: 'qf-4', round: 'Quarter-final', homeTeamId: 'argentina', awayTeamId: 'switzerland', homeScore: 3, awayScore: 1, kickoffUtc: '2026-07-12T01:00:00.000Z' },

  // Semi-finals — 14–15 July 2026
  { id: 'sf-1', round: 'Semi-final', homeTeamId: 'france', awayTeamId: 'spain', homeScore: 0, awayScore: 2, kickoffUtc: '2026-07-14T19:00:00.000Z' },
  { id: 'sf-2', round: 'Semi-final', homeTeamId: 'argentina', awayTeamId: 'england', homeScore: 2, awayScore: 1, kickoffUtc: '2026-07-15T19:00:00.000Z' },

  // Final — 19 July 2026, MetLife Stadium
  {
    id: 'final',
    round: 'Final',
    homeTeamId: 'spain',
    awayTeamId: 'argentina',
    homeScore: 1,
    awayScore: 0,
    kickoffUtc: '2026-07-19T19:00:00.000Z',
    note: 'After extra time. Spain won its second World Cup.',
  },
]

export const ARCHIVE_CHAMPION_TEAM_ID = 'spain'

/** Quick lookups used throughout the case study section. */
export const archiveTeamById = new Map(archiveTeams.map((team) => [team.id, team]))
export const archivePlayerById = new Map(archivePlayers.map((player) => [player.id, player]))

export const ARCHIVE_ROUNDS = [
  'Round of 16',
  'Quarter-final',
  'Semi-final',
  'Final',
] as const
