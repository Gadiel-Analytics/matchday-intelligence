import { Panel, SectionHeading } from '../components/Panel'

interface Decision {
  title: string
  options: string
  tradeoff: string
  rationale: string
  revisit: string
}

/**
 * The decision log is the differentiator.
 *
 * A reviewer has seen many football dashboards. Far fewer show what was
 * considered and rejected, and under what condition the choice should be
 * reversed. Each entry therefore carries a revisit trigger — a decision without
 * one is a preference.
 */
const decisions: Decision[] = [
  {
    title: 'Read-only by construction, not by permission',
    options:
      'Keep the operator write endpoints and defend them with JWT validation; or ship a build with no write routes at all.',
    tradeoff:
      'Keeping writes preserves a live admin surface and needs correct, continuously maintained auth. Removing them means the public deployment can never be corrected in place — a bad ingest has to be fixed by a code change and redeploy.',
    rationale:
      'The public build has no operator, so an authenticated write path would be a defended surface with no user. Removing the routes eliminates the class of vulnerability rather than mitigating it, and the credential never leaves the scheduled job.',
    revisit:
      'If the system ever needs an operator again, restore writes behind edge-verified identity, validated server-side — never behind a frontend route check.',
  },
  {
    title: 'Key on feed IDs, not on team names',
    options:
      'Extend the hand-maintained name-to-id table that v1 used; or key every record on football-data.org’s own numeric team ids.',
    tradeoff:
      'A name table is readable and needs no extra lookup. Numeric ids are opaque in the database but stable across spelling, punctuation and language variants.',
    rationale:
      'The name table was the single largest source of production incidents in v1 — four variants had to be patched live mid-tournament. Club competitions multiply the variance, so extending it would repeat a known failure at larger scale.',
    revisit:
      'If the feed is replaced by a provider without stable ids, reintroduce a mapping layer — but as an explicit, tested translation table with a reported miss count, never as a silent lookup.',
  },
  {
    title: 'Encode a shootout as the scoreline',
    options:
      'Add a dedicated tiebreaker field to the schema and teach the engine to read it; or record the shootout tally in the existing score columns.',
    tradeoff:
      'A dedicated field is semantically correct and would scale to other tiebreaker types. The existing columns need no migration and no engine branch, at the cost of the stored number no longer being a literal count of open-play goals for that match.',
    rationale:
      'The engine resolves progression by comparing two numbers. Encoding the outcome in those numbers makes elimination correct for free, mid-tournament, with no schema change under time pressure. The affected match is annotated in the archive so the reading is never ambiguous.',
    revisit:
      'If goals ever become meaningful on their own — a top-scorer table, goal-based scoring — split the fields properly first.',
  },
  {
    title: 'Additive-only migrations for each new round',
    options:
      'Pre-build the whole bracket with placeholder teams; or add each round as its own additive migration once the teams are known.',
    tradeoff:
      'Pre-building is one migration and no ongoing work, but requires mutating placeholder rows later — the operation most likely to damage recorded results. Per-round migrations mean four separate deployments during a live tournament.',
    rationale:
      'Each migration only inserts. It never updates or deletes, so no previously recorded result is reachable by it. Each one was validated against a realistic snapshot with a before-and-after diff proving prior rounds byte-identical. Four rounds shipped this way with no data-loss incident.',
    revisit:
      'For a competition whose full bracket is known in advance, pre-building is fine — the constraint here was that each round’s teams were genuinely unknowable until the previous round ended.',
  },
  {
    title: 'Freeze the finished tournament as a static fixture',
    options:
      'Leave the archive in the live database; or export it once and commit it as static data.',
    tradeoff:
      'A live table keeps one code path. A static fixture duplicates the read logic, but the case study then renders with zero backend calls and cannot be affected by a schema change or a bad ingest.',
    rationale:
      'A finished tournament has no reason to be mutable. Freezing it removes an entire category of future breakage from a section whose only job is to be a permanent record, and lets a reader inspect the exact source data in the repository.',
    revisit:
      'Never, for this tournament. For a competition still in progress, the live path is correct.',
  },
  {
    title: 'Report unknowns as unknown',
    options:
      'Render missing or delayed values as zero, or as the last known figure; or render them as explicitly not available.',
    tradeoff:
      'Zeros and cached values keep every panel looking populated. Explicit unknowns leave visible gaps and require more state handling in the UI.',
    rationale:
      'A zero is a claim. Showing one for a fixture that has not kicked off, or a rate with no sample behind it, states something false with the same confidence as a real reading. Competitions with no scored matches are held out of the comparative ranking rather than sorted last.',
    revisit:
      'Not a trade-off worth reversing. If the gaps read as broken, fix the copy so the gap explains itself.',
  },
]

export function DecisionLog() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <SectionHeading
        id="decisions"
        eyebrow="Decisions"
        title="What was chosen, and what was given up"
        description="Each entry records the alternatives that were genuinely considered, the trade-off accepted, and the condition under which the decision should be reversed."
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {decisions.map((decision, index) => (
          <Panel key={decision.title} className="p-5">
            <div className="flex items-baseline gap-3">
              <span className="ga-machine text-[11px] text-ga-text-muted">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="text-[15px] font-semibold text-ga-text-primary">
                {decision.title}
              </h3>
            </div>

            <dl className="mt-4 space-y-3">
              <Field label="Options" value={decision.options} />
              <Field label="Trade-off" value={decision.tradeoff} />
              <Field label="Rationale" value={decision.rationale} />
              <Field label="Revisit when" value={decision.revisit} accent />
            </dl>
          </Panel>
        ))}
      </div>
    </section>
  )
}

function Field({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className={accent ? 'border-t border-ga-border-subtle pt-3' : undefined}>
      <dt className={`ga-eyebrow ${accent ? 'text-ga-info' : ''}`}>{label}</dt>
      <dd className="mt-1 text-[13px] leading-relaxed text-ga-text-secondary">{value}</dd>
    </div>
  )
}

interface Incident {
  title: string
  symptom: string
  cause: string
  fix: string
}

const incidents: Incident[] = [
  {
    title: 'Invisible buttons after a routine deploy',
    symptom:
      'The header and every primary button rendered transparent. Text was present but sat on no background. The build passed with no error.',
    cause:
      'The design tokens were declared as loose custom properties and had been dropped by a later edit. Every utility referencing them resolved to an empty value, which CSS treats as transparent rather than as an error.',
    fix: 'Tokens moved into the framework’s own theme block, which generates real utility classes and fails loudly if a token is missing.',
  },
  {
    title: 'Draw refused to run: 55 eligible teams, expected 16',
    symptom:
      'The eligibility check reported far more teams than the tournament contained, blocking the draw.',
    cause:
      'Teams were global reference data shared across tournaments, and eligibility filtered on a status column rather than on tournament membership. Every team ever seeded matched.',
    fix: 'Eligibility now derives from the teams that actually appear in the tournament’s own fixtures, which is exact by construction.',
  },
  {
    title: 'A deploy silently created a second, empty service',
    symptom:
      'The deploy reported success, but the running service was unchanged. A new, empty service had appeared under a similar name.',
    cause:
      'Passing the entry file as a positional argument caused the tool to ignore the configured service name and provision a new one.',
    fix: 'Deploys always pass an explicit config path, and the reported service name is checked against the expected one before the deploy is considered done.',
  },
  {
    title: 'Save button appeared to do nothing',
    symptom:
      'Assignments looked saved until the page was refreshed, at which point they were gone. No error surfaced.',
    cause:
      'One insert named a column that did not exist. The whole batch was atomic, so a single bad statement rolled back the entire write silently.',
    fix: 'The persistence path is now exercised against a real database in tests, not inferred from the interface reporting success.',
  },
]

export function EngineeringNotes() {
  return (
    <section className="border-t border-ga-border-subtle bg-ga-shell">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <SectionHeading
          eyebrow="Incidents"
          title="Four failures worth keeping"
          description="Recorded during the production run. Each is kept with its root cause rather than just its fix, because the cause is the part that generalises."
        />

        <div className="mt-8 space-y-3">
          {incidents.map((incident) => (
            <Panel key={incident.title} className="p-5">
              <h3 className="text-[15px] font-semibold text-ga-text-primary">
                {incident.title}
              </h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="Symptom" value={incident.symptom} />
                <Field label="Root cause" value={incident.cause} />
                <Field label="Fix" value={incident.fix} />
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Limitations() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <SectionHeading
        eyebrow="Limits"
        title="Where this design stops being appropriate"
        description="The architecture suits a small audience reading finished results cheaply. Pushed past that, its assumptions break — and knowing the boundary is part of the design."
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Limit
          title="Not real-time"
          body="Scores on the feed's free tier are delayed at source. Polling more often reduces the gap between publication and display; it cannot make the publication itself instant. In-play second-by-second data needs a push feed and a paid tier."
        />
        <Limit
          title="Not built for write concurrency"
          body="One scheduled writer, last write wins. That is correct here and wrong for anything with many concurrent writers, where this database posture would need to change first."
        />
        <Limit
          title="Derived metrics are sample-sensitive"
          body="Early-season figures move sharply on a single result. They are reported with the sample size attached rather than smoothed into looking stable."
        />
        <Limit
          title="Six competitions, not twelve"
          body="The feed offers twelve free competitions. Coverage is deliberately capped so the rotation stays well inside the rate ceiling and the analysis stays comparable."
        />
      </div>
    </section>
  )
}

function Limit({ title, body }: { title: string; body: string }) {
  return (
    <Panel className="p-5">
      <h3 className="text-sm font-semibold text-ga-text-primary">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-ga-text-secondary">{body}</p>
    </Panel>
  )
}
