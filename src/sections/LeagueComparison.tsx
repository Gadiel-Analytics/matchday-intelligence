import { Panel, SectionHeading } from '../components/Panel'
import { StatusNote } from '../components/StatusNote'
import { competitionMetrics, rankByCompetitiveness } from '../lib/analytics'
import { decimal1, decimal2, percent0 } from '../lib/format'
import type { CompetitionSnapshot } from '../types/domain'

interface LeagueComparisonProps {
  snapshots: CompetitionSnapshot[]
  state: 'loading' | 'ready' | 'error'
}

/**
 * The part a scoreboard does not give you.
 *
 * Every figure here is derived from the same ingested rows the live section
 * renders, which is the point: one pipeline, and analysis on top of it rather
 * than beside it.
 */
export function LeagueComparison({ snapshots, state }: LeagueComparisonProps) {
  const metrics = snapshots.map(competitionMetrics)
  const { computable, notComputable } = rankByCompetitiveness(metrics)

  return (
    <section className="border-y border-ga-border-subtle bg-ga-shell">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <SectionHeading
          id="compare"
          eyebrow="Derived"
          title="Which competition is actually tightest?"
          description="Points spread is the population standard deviation of every team's points total. A low spread means the table is compressed and results are hard to predict; a high spread means a settled hierarchy."
        />

        {state !== 'ready' ? (
          <div className="mt-8">
            <StatusNote tone="neutral" label="Not computed">
              These figures are derived from live standings. They appear once the pipeline
              responds.
            </StatusNote>
          </div>
        ) : (
          <>
            <Panel className="mt-8 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <caption className="sr-only">
                    Derived competition metrics, ranked by points spread
                  </caption>
                  <thead>
                    <tr className="border-b border-ga-border-subtle text-left">
                      <th scope="col" className="ga-eyebrow px-5 py-3 font-semibold">
                        Competition
                      </th>
                      <th scope="col" className="ga-eyebrow py-3 text-right font-semibold">
                        Played
                      </th>
                      <th scope="col" className="ga-eyebrow py-3 text-right font-semibold">
                        Goals / match
                      </th>
                      <th scope="col" className="ga-eyebrow py-3 text-right font-semibold">
                        Draws
                      </th>
                      <th scope="col" className="ga-eyebrow py-3 text-right font-semibold">
                        Home wins
                      </th>
                      <th scope="col" className="ga-eyebrow py-3 text-right font-semibold">
                        Leader margin
                      </th>
                      <th scope="col" className="ga-eyebrow px-5 py-3 text-right font-semibold">
                        Points spread
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {computable.map((metric, index) => (
                      <tr
                        key={metric.code}
                        className="border-b border-ga-border-subtle/60 last:border-0"
                      >
                        <th
                          scope="row"
                          className="px-5 py-3 text-left font-medium text-ga-text-primary"
                        >
                          <span className="ga-machine mr-2 text-[11px] text-ga-text-muted">
                            {metric.code}
                          </span>
                          {metric.shortName}
                          {index === 0 && (
                            <span className="ga-eyebrow ml-2 text-ga-positive">
                              Tightest
                            </span>
                          )}
                        </th>
                        <td className="ga-numeric py-3 text-right text-ga-text-secondary">
                          {metric.matchesPlayed}
                        </td>
                        <td className="ga-numeric py-3 text-right text-ga-text-secondary">
                          {decimal2(metric.goalsPerMatch)}
                        </td>
                        <td className="ga-numeric py-3 text-right text-ga-text-secondary">
                          {percent0(metric.drawRate)}
                        </td>
                        <td className="ga-numeric py-3 text-right text-ga-text-secondary">
                          {percent0(metric.homeWinRate)}
                        </td>
                        <td className="ga-numeric py-3 text-right text-ga-text-secondary">
                          {metric.leaderMargin === null ? '—' : `${metric.leaderMargin} pt`}
                        </td>
                        <td className="ga-numeric px-5 py-3 text-right font-semibold text-ga-text-primary">
                          {decimal1(metric.pointsSpread)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            {notComputable.length > 0 && (
              <div className="mt-4">
                <StatusNote tone="neutral" label="Not computable">
                  {notComputable.map((metric) => metric.shortName).join(', ')}{' '}
                  {notComputable.length === 1 ? 'has' : 'have'} not played a scored match
                  this season, so spread and rates are undefined. They are held out of the
                  ranking rather than reported as zero.
                </StatusNote>
              </div>
            )}

            <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-ga-text-muted">
              Early in a season these numbers are volatile by construction: with two or
              three matches played, a single result moves the spread more than it will in
              March. The figures are honest about the sample they come from, not smoothed
              to look stable.
            </p>
          </>
        )}
      </div>
    </section>
  )
}
