import { PipelinePulse } from '../components/PipelinePulse'
import type { SyncStatus } from '../types/domain'

interface HeroProps {
  syncStatus: SyncStatus | null
  state: 'loading' | 'ready' | 'error'
}

/**
 * The hero states the thesis and then proves it, in that order.
 *
 * The proof is the pipeline pulse rather than a metric block: for a portfolio
 * artifact the reader's first question is whether the system is real, and a
 * live freshness reading answers that in a way a headline number cannot.
 */
export function Hero({ syncStatus, state }: HeroProps) {
  return (
    <section id="top" className="border-b border-ga-border-subtle bg-ga-shell">
      <div className="mx-auto max-w-6xl px-5 pt-16 pb-14 sm:pt-24 sm:pb-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <p className="ga-eyebrow">Decision system · Football data</p>

            <h1 className="mt-5 text-4xl leading-[1.05] font-bold tracking-tight text-ga-text-primary sm:text-5xl lg:text-[3.4rem]">
              One decision system.
              <br />
              <span className="ga-gradient-text">Two data planes.</span>
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ga-text-secondary sm:text-base">
              Six European competitions are ingested live and resolved through league
              tables. The World Cup knockout case study is preserved separately as a frozen
              archive. Both surfaces derive their analytical views deterministically and show
              their provenance — including where the data runs out.
            </p>

            <dl className="mt-9 grid max-w-lg grid-cols-3 gap-6 border-t border-ga-border-subtle pt-6">
              <Fact value="6" label="competitions tracked" />
              <Fact value="15" label="knockout matches archived" />
              <Fact value="$0" label="monthly infrastructure" />
            </dl>
          </div>

          <div className="lg:pl-4">
            <PipelinePulse syncStatus={syncStatus} state={state} />
            <p className="mt-3 text-[12px] leading-relaxed text-ga-text-muted">
              Reading taken from the live deployment. If the pipeline is unreachable this
              panel says so rather than showing the last value it happens to remember.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="ga-numeric block text-2xl font-bold text-ga-text-primary sm:text-3xl">
          {value}
        </span>
        <span className="mt-1 block text-[11px] leading-snug text-ga-text-muted">
          {label}
        </span>
      </dd>
    </div>
  )
}
