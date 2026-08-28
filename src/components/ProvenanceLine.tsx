import { relativeAge } from '../lib/format'
import { useNow } from '../hooks/useNow'

interface ProvenanceLineProps {
  source: string
  fetchedAt: string | null
  extra?: string
}

/**
 * Two-dimension provenance, shown next to the data rather than buried in logs:
 * where the figure came from, and when it was last fetched.
 *
 * This is deliberately always visible. A number without an origin and an age is
 * an assertion; a number with both is evidence.
 */
export function ProvenanceLine({ source, fetchedAt, extra }: ProvenanceLineProps) {
  const now = useNow()

  return (
    <p className="ga-machine flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ga-text-muted">
      <span className="text-ga-text-secondary">source</span>
      <span>{source}</span>
      <span aria-hidden className="text-ga-border-strong">
        ·
      </span>
      <span className="text-ga-text-secondary">fetched</span>
      <span>{relativeAge(fetchedAt, now)}</span>
      {extra && (
        <>
          <span aria-hidden className="text-ga-border-strong">
            ·
          </span>
          <span>{extra}</span>
        </>
      )}
    </p>
  )
}
