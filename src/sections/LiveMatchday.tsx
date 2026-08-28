import { useState } from 'react'
import { Panel, SectionHeading } from '../components/Panel'
import { ProvenanceLine } from '../components/ProvenanceLine'
import { StatusNote } from '../components/StatusNote'
import { countdownTo, formatKickoff, scoreOrDash } from '../lib/format'
import { useNow } from '../hooks/useNow'
import type { CompetitionSnapshot, Match, StandingRow } from '../types/domain'

interface LiveMatchdayProps {
  snapshots: CompetitionSnapshot[]
  fetchedAt: string | null
  state: 'loading' | 'ready' | 'error'
  errorMessage: string | null
  onRetry: () => void
}

export function LiveMatchday({
  snapshots,
  fetchedAt,
  state,
  errorMessage,
  onRetry,
}: LiveMatchdayProps) {
  const [activeCode, setActiveCode] = useState<string | null>(null)
  const active =
    snapshots.find((snapshot) => snapshot.competition.code === activeCode) ?? snapshots[0]

  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <SectionHeading
        id="live"
        eyebrow="Live"
        title="Current matchday"
        description="Six competitions, refreshed on a rotating schedule that respects the feed's rate ceiling. Tables, latest results and next fixtures come from the same ingestion path."
      />

      {state === 'loading' && (
        <Panel className="mt-8 p-8">
          <p className="ga-machine text-sm text-ga-text-muted">Loading pipeline data…</p>
        </Panel>
      )}

      {state === 'error' && (
        <div className="mt-8 space-y-3">
          <StatusNote tone="negative" label="Pipeline unreachable">
            {errorMessage} No cached or placeholder figures are shown in its place — an
            empty reading is accurate, an invented one is not.
          </StatusNote>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-ga-border-strong px-4 py-2 text-[13px] font-medium text-ga-text-secondary transition-colors hover:border-ga-focus hover:text-ga-text-primary"
          >
            Try again
          </button>
        </div>
      )}

      {state === 'ready' && snapshots.length === 0 && (
        <div className="mt-8">
          <StatusNote tone="neutral" label="No competitions">
            The pipeline responded but is tracking no competitions yet. Seed the
            competition table and wait for the first rotation.
          </StatusNote>
        </div>
      )}

      {state === 'ready' && active && (
        <>
          <div
            role="tablist"
            aria-label="Competitions"
            className="mt-8 flex flex-wrap gap-2"
          >
            {snapshots.map((snapshot) => {
              const isActive = snapshot.competition.code === active.competition.code
              return (
                <button
                  key={snapshot.competition.code}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  onClick={() => setActiveCode(snapshot.competition.code)}
                  className={`rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'border-ga-border-strong bg-ga-surface-2 text-ga-text-primary'
                      : 'border-ga-border-subtle text-ga-text-muted hover:border-ga-border-strong hover:text-ga-text-secondary'
                  }`}
                >
                  <span className="ga-machine mr-2 text-[11px] text-ga-text-muted">
                    {snapshot.competition.code}
                  </span>
                  {snapshot.competition.shortName}
                </button>
              )
            })}
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Panel className="overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ga-border-subtle px-5 py-4">
                <h3 className="text-sm font-semibold text-ga-text-primary">
                  {active.competition.name}
                </h3>
                <span className="ga-machine text-[11px] text-ga-text-muted">
                  {active.competition.season} · {active.competition.shape.toLowerCase()}
                </span>
              </div>
              <StandingsTable rows={active.standings} />
            </Panel>

            <div className="space-y-5">
              <Panel>
                <h3 className="border-b border-ga-border-subtle px-5 py-4 text-sm font-semibold text-ga-text-primary">
                  Latest results
                </h3>
                <MatchList matches={active.recentResults} kind="result" />
              </Panel>

              <Panel>
                <h3 className="border-b border-ga-border-subtle px-5 py-4 text-sm font-semibold text-ga-text-primary">
                  Next fixtures
                </h3>
                <MatchList matches={active.upcomingFixtures} kind="fixture" />
              </Panel>
            </div>
          </div>

          <div className="mt-4">
            <ProvenanceLine
              source="football-data.org/v4"
              fetchedAt={fetchedAt}
              extra={`${active.competition.code} · ${active.standings.length} teams`}
            />
          </div>
        </>
      )}
    </section>
  )
}

function StandingsTable({ rows }: { rows: StandingRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-5 py-6">
        <StatusNote tone="neutral" label="No table yet">
          This competition has not played a scored match this season, so no table exists to
          show.
        </StatusNote>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <caption className="sr-only">League table</caption>
        <thead>
          <tr className="border-b border-ga-border-subtle text-left">
            <th scope="col" className="ga-eyebrow px-5 py-2.5 font-semibold">
              #
            </th>
            <th scope="col" className="ga-eyebrow py-2.5 font-semibold">
              Team
            </th>
            <th scope="col" className="ga-eyebrow py-2.5 text-right font-semibold">
              P
            </th>
            <th scope="col" className="ga-eyebrow py-2.5 text-right font-semibold">
              GD
            </th>
            <th scope="col" className="ga-eyebrow px-5 py-2.5 text-right font-semibold">
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.teamId}
              className="border-b border-ga-border-subtle/60 last:border-0"
            >
              <td className="ga-numeric px-5 py-2.5 text-ga-text-muted">{row.position}</td>
              <td className="py-2.5 font-medium text-ga-text-primary">{row.teamName}</td>
              <td className="ga-numeric py-2.5 text-right text-ga-text-secondary">
                {row.played}
              </td>
              <td className="ga-numeric py-2.5 text-right text-ga-text-secondary">
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </td>
              <td className="ga-numeric px-5 py-2.5 text-right font-semibold text-ga-text-primary">
                {row.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MatchList({ matches, kind }: { matches: Match[]; kind: 'result' | 'fixture' }) {
  const now = useNow()

  if (matches.length === 0) {
    return (
      <div className="px-5 py-5">
        <p className="text-[13px] text-ga-text-muted">
          {kind === 'result'
            ? 'No finished matches yet this season.'
            : 'No fixtures scheduled in the current window.'}
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-ga-border-subtle/60">
      {matches.slice(0, 6).map((match) => (
        <li key={match.id} className="px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-[13px] text-ga-text-primary">
              {match.homeTeamName}
            </span>
            {kind === 'fixture' ? (
              <span className="ga-machine shrink-0 text-[11px] text-ga-text-muted">vs</span>
            ) : (
              <span className="ga-numeric shrink-0 text-[13px] font-semibold text-ga-text-primary">
                {scoreOrDash(match.homeScore)}
                <span className="mx-1 text-ga-text-muted">–</span>
                {scoreOrDash(match.awayScore)}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-right text-[13px] text-ga-text-primary">
              {match.awayTeamName}
            </span>
          </div>
          <p className="ga-machine mt-1 text-[11px] text-ga-text-muted">
            {kind === 'fixture'
              ? `${formatKickoff(match.kickoffUtc)}${
                  countdownTo(match.kickoffUtc, now)
                    ? ` · in ${countdownTo(match.kickoffUtc, now)}`
                    : ''
                }`
              : formatKickoff(match.kickoffUtc)}
          </p>
        </li>
      ))}
    </ul>
  )
}
