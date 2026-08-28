import { relativeAge } from '../lib/format'
import { useNow } from '../hooks/useNow'
import type { SyncStatus } from '../types/domain'

interface PipelinePulseProps {
  syncStatus: SyncStatus | null
  state: 'loading' | 'ready' | 'error'
}

/** Ticks are cosmetic spacing only; the leading tick carries the real reading. */
const TICK_COUNT = 28

/**
 * The page's signature element: a heartbeat for the ingestion pipeline.
 *
 * Everything else on this page is a view over stored data. This is the one
 * component that answers the question a reader actually has about a portfolio
 * project — "is this thing still running, or is it a screenshot?" — so it gets
 * the brand gradient, and nothing else in the hero competes with it.
 *
 * The ticks are a rhythm, not a chart: only the most recent run is a measured
 * value, and it is stated in words beside them. Drawing 28 fabricated data
 * points would be exactly the kind of decorative dashboard the brand standard
 * warns against.
 */
export function PipelinePulse({ syncStatus, state }: PipelinePulseProps) {
  const now = useNow()
  const lastRun = syncStatus?.lastRunAt ?? null
  const isLive = state === 'ready' && Boolean(lastRun)

  const ageMinutes = lastRun
    ? Math.floor((now - new Date(lastRun).getTime()) / 60000)
    : null

  // Anything past two hours means a rotation was missed; say so rather than
  // presenting a stale figure as current.
  const isStale = ageMinutes !== null && ageMinutes > 120

  const statusLabel = !isLive
    ? state === 'loading'
      ? 'Connecting'
      : 'Unreachable'
    : isStale
      ? 'Stale'
      : 'Live'

  const statusColour = !isLive
    ? state === 'loading'
      ? 'text-ga-neutral'
      : 'text-ga-negative'
    : isStale
      ? 'text-ga-warning'
      : 'text-ga-positive'

  return (
    <div className="rounded-xl border border-ga-border-subtle bg-ga-surface-1/80 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="ga-eyebrow">Ingestion pipeline</p>
        <p className={`ga-machine text-[11px] font-semibold ${statusColour}`}>
          {isLive && !isStale && (
            <span aria-hidden className="mr-1.5 inline-block">
              ●
            </span>
          )}
          {statusLabel}
        </p>
      </div>

      <div
        aria-hidden
        className="mt-4 flex h-9 items-end gap-[3px]"
        style={{ opacity: isLive ? 1 : 0.35 }}
      >
        {Array.from({ length: TICK_COUNT }).map((_, index) => {
          const isLeading = index === TICK_COUNT - 1
          const height = isLeading ? 100 : 28 + ((index * 37) % 46)

          return (
            <span
              key={index}
              className="flex-1 rounded-[2px]"
              style={{
                height: `${height}%`,
                minWidth: '2px',
                background: isLeading
                  ? 'linear-gradient(180deg, #16a3ff 0%, #4658ff 52%, #9b3dff 100%)'
                  : 'var(--color-ga-border-strong)',
              }}
            />
          )
        })}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Reading label="Last run" value={lastRun ? relativeAge(lastRun, now) : '—'} />
        <Reading
          label="Competitions"
          value={syncStatus ? String(syncStatus.competitionsSynced.length) : '—'}
        />
        <Reading
          label="Matches held"
          value={syncStatus ? String(syncStatus.matchesIngested) : '—'}
        />
        <Reading
          label="Unresolved"
          value={syncStatus ? String(syncStatus.unresolved) : '—'}
          tone={syncStatus && syncStatus.unresolved > 0 ? 'warning' : undefined}
        />
      </dl>
    </div>
  )
}

function Reading({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'warning'
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-ga-text-muted">{label}</dt>
      <dd
        className={`ga-numeric mt-0.5 text-[15px] leading-tight font-semibold whitespace-nowrap ${
          tone === 'warning' ? 'text-ga-warning' : 'text-ga-text-primary'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
