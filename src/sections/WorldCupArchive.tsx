import { Panel, SectionHeading } from '../components/Panel'
import {
  ARCHIVE_CHAMPION_TEAM_ID,
  ARCHIVE_ROUNDS,
  ARCHIVE_WINDOW,
  archiveAssignments,
  archiveMatches,
  archivePlayerById,
  archivePlayers,
  archiveTeamById,
} from '../data/wc2026Archive'
import { calculateStandings, winnerOf } from '../lib/survivorScoring'
import { formatDateOnly } from '../lib/format'
import type { ArchiveMatch } from '../types/domain'

const standings = calculateStandings(archivePlayers, archiveAssignments, archiveMatches)

/** Owner colour for a team, or null when nobody held it. */
function ownerColour(teamId: string): string | null {
  const assignment = archiveAssignments.find((entry) => entry.teamId === teamId)
  if (!assignment) return null
  return archivePlayerById.get(assignment.playerId)?.colour ?? null
}

/**
 * The archived v1 product.
 *
 * This section carries a restrained pitch-green accent that appears nowhere
 * else on the page. The colour is doing semantic work: it marks this as the
 * retired system with its own former identity, rather than decorating a card.
 */
export function WorldCupArchive() {
  const champion = archiveTeamById.get(ARCHIVE_CHAMPION_TEAM_ID)
  const winner = standings[0]
  const winnerName = archivePlayerById.get(winner.playerId)?.displayName ?? '—'

  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <SectionHeading
        id="archive"
        eyebrow="Case study · Archived"
        title="World Cup 2026 survivor pool"
        description="The system's first production run: eight participants, sixteen teams, one draw, no second chances. It ran unattended through four knockout rounds against a fixed external schedule. The data below is frozen exactly as it finished."
      />

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className="ga-machine rounded-md px-2.5 py-1 text-[11px] font-semibold"
          style={{
            color: 'var(--color-ga-archive)',
            backgroundColor: 'color-mix(in srgb, var(--color-ga-archive-deep) 70%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-ga-archive) 30%, transparent)',
          }}
        >
          Archived · read-only
        </span>
        <span className="ga-machine text-[11px] text-ga-text-muted">
          {formatDateOnly(`${ARCHIVE_WINDOW.from}T00:00:00.000Z`)} –{' '}
          {formatDateOnly(`${ARCHIVE_WINDOW.to}T00:00:00.000Z`)} · 15 matches · 8
          participants
        </span>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <Panel className="p-5">
          <p className="ga-eyebrow">Outcome</p>
          <p className="mt-4 text-[15px] leading-relaxed text-ga-text-secondary">
            <span className="font-semibold text-ga-text-primary">{winnerName}</span> took
            the pool with{' '}
            <span className="ga-numeric font-semibold text-ga-text-primary">
              {winner.points}
            </span>{' '}
            points, holding {champion?.flag} {champion?.name} through the final. The
            tournament was decided by a single extra-time goal.
          </p>

          <dl className="mt-6 space-y-3 border-t border-ga-border-subtle pt-5">
            <Row label="Scoring" value="3 win · 1 draw · +1 per goal · +1 clean sheet" />
            <Row label="Cutoff" value="Knockout stage only, from 1 July" />
            <Row label="Elimination" value="Out when every held team is out" />
            <Row label="Participants" value="Pseudonymous — see note below" />
          </dl>

          <p className="mt-5 border-t border-ga-border-subtle pt-4 text-[12px] leading-relaxed text-ga-text-muted">
            The author is named. The other seven participants were private individuals and
            appear under AI model names. Assignments, scores and outcomes are unmodified.
          </p>
        </Panel>

        <Panel className="overflow-hidden">
          <h3 className="border-b border-ga-border-subtle px-5 py-4 text-sm font-semibold text-ga-text-primary">
            Final standings
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <caption className="sr-only">Final survivor pool standings</caption>
              <thead>
                <tr className="border-b border-ga-border-subtle text-left">
                  <th scope="col" className="ga-eyebrow px-5 py-2.5 font-semibold">
                    #
                  </th>
                  <th scope="col" className="ga-eyebrow py-2.5 font-semibold">
                    Participant
                  </th>
                  <th scope="col" className="ga-eyebrow py-2.5 font-semibold">
                    Teams
                  </th>
                  <th scope="col" className="ga-eyebrow px-5 py-2.5 text-right font-semibold">
                    Pts
                  </th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => {
                  const player = archivePlayerById.get(row.playerId)
                  return (
                    <tr
                      key={row.playerId}
                      className="border-b border-ga-border-subtle/60 last:border-0"
                    >
                      <td className="ga-numeric px-5 py-2.5 text-ga-text-muted">
                        {row.rank}
                      </td>
                      <td className="py-2.5">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: player?.colour }}
                          />
                          <span className="font-medium text-ga-text-primary">
                            {player?.displayName}
                          </span>
                          {row.rank === 1 && (
                            <span className="ga-eyebrow text-ga-positive">Winner</span>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 text-ga-text-secondary">
                        {row.teamIds
                          .map((id) => archiveTeamById.get(id)?.flag ?? '')
                          .join(' ')}
                      </td>
                      <td className="ga-numeric px-5 py-2.5 text-right font-semibold text-ga-text-primary">
                        {row.points}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel className="mt-5 overflow-hidden">
        <h3 className="border-b border-ga-border-subtle px-5 py-4 text-sm font-semibold text-ga-text-primary">
          Road to the final
        </h3>
        <div className="overflow-x-auto p-5">
          <div className="grid min-w-[720px] grid-cols-4 gap-4">
            {ARCHIVE_ROUNDS.map((round) => (
              <div key={round}>
                <p className="ga-eyebrow mb-3">{round}</p>
                <div className="space-y-2">
                  {archiveMatches
                    .filter((match) => match.round === round)
                    .map((match) => (
                      <BracketMatch key={match.id} match={match} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </section>
  )
}

function BracketMatch({ match }: { match: ArchiveMatch }) {
  const home = archiveTeamById.get(match.homeTeamId)
  const away = archiveTeamById.get(match.awayTeamId)
  const winnerId = winnerOf(match)

  return (
    <div className="rounded-lg border border-ga-border-subtle bg-ga-surface-2/50">
      <TeamRow
        flag={home?.flag ?? ''}
        name={home?.name ?? ''}
        score={match.homeScore}
        isWinner={winnerId === match.homeTeamId}
        colour={ownerColour(match.homeTeamId)}
      />
      <div className="border-t border-ga-border-subtle/60" />
      <TeamRow
        flag={away?.flag ?? ''}
        name={away?.name ?? ''}
        score={match.awayScore}
        isWinner={winnerId === match.awayTeamId}
        colour={ownerColour(match.awayTeamId)}
      />
      {match.note && (
        <p className="border-t border-ga-border-subtle/60 px-2.5 py-1.5 text-[10px] leading-snug text-ga-text-muted">
          {match.note}
        </p>
      )}
    </div>
  )
}

function TeamRow({
  flag,
  name,
  score,
  isWinner,
  colour,
}: {
  flag: string
  name: string
  score: number
  isWinner: boolean
  colour: string | null
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2">
      <span
        aria-hidden
        className="h-6 w-[3px] shrink-0 rounded-full"
        style={{ backgroundColor: colour ?? 'var(--color-ga-border-strong)' }}
      />
      <span aria-hidden className="text-sm">
        {flag}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[12px] ${
          isWinner ? 'font-semibold text-ga-text-primary' : 'text-ga-text-secondary'
        }`}
      >
        {name}
      </span>
      <span
        className={`ga-numeric text-[12px] ${
          isWinner ? 'font-semibold text-ga-text-primary' : 'text-ga-text-muted'
        }`}
      >
        {score}
      </span>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[12px] text-ga-text-muted">{label}</dt>
      <dd className="text-right text-[12px] font-medium text-ga-text-secondary">{value}</dd>
    </div>
  )
}
