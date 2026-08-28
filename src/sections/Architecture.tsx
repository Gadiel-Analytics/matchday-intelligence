import { Panel, SectionHeading } from '../components/Panel'
import { READ_ONLY_ENDPOINTS, apiBaseForDisplay } from '../lib/apiClient'

/**
 * Architecture section.
 *
 * Diagrams are inline SVG rather than exported images: they stay legible at any
 * zoom, inherit theme tokens, and show up in a diff when the architecture
 * changes. A screenshot of a diagram goes stale silently.
 */
export function Architecture() {
  return (
    <section className="border-y border-ga-border-subtle bg-ga-shell">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <SectionHeading
          id="architecture"
          eyebrow="How it works"
          title="A read-only pipeline on free-tier infrastructure"
          description="Four moving parts: a scheduled ingester, an edge database, a read-only API, and a static frontend. No queues, no cache layer, no orchestration — the load does not justify them, and saying so is part of the design."
        />

        <Panel className="mt-8 p-6">
          <SystemDiagram />
        </Panel>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel className="p-6">
            <h3 className="text-sm font-semibold text-ga-text-primary">
              Rotation, not a burst
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-ga-text-secondary">
              The feed allows ten requests per minute. Six competitions needing two
              endpoints each is twelve calls — over the ceiling if issued together. Each
              scheduled run therefore takes the next competitions in sequence, so the
              ceiling is never approached and every competition is refreshed on a
              predictable cycle.
            </p>
            <div className="mt-5">
              <RotationDiagram />
            </div>
          </Panel>

          <Panel className="p-6">
            <h3 className="text-sm font-semibold text-ga-text-primary">
              Read-only by construction
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-ga-text-secondary">
              The public API exposes no write route. Not a protected write route — no write
              route at all. The ingester is the only writer, it runs on a schedule inside
              the Worker, and it holds the only credential, which never reaches the
              browser.
            </p>

            <ul className="mt-5 space-y-2">
              {READ_ONLY_ENDPOINTS.map((endpoint) => (
                <li
                  key={endpoint.path}
                  className="rounded-lg border border-ga-border-subtle bg-ga-surface-2/40 px-3 py-2.5"
                >
                  <p className="ga-machine text-[12px]">
                    <span className="mr-2 font-semibold text-ga-positive">
                      {endpoint.method}
                    </span>
                    <span className="text-ga-text-primary">{endpoint.path}</span>
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-ga-text-muted">
                    {endpoint.description}
                  </p>
                </li>
              ))}
            </ul>

            <p className="ga-machine mt-4 text-[11px] break-all text-ga-text-muted">
              base: {apiBaseForDisplay}
            </p>
          </Panel>
        </div>
      </div>
    </section>
  )
}

const BOX = {
  fill: 'var(--color-ga-surface-2)',
  stroke: 'var(--color-ga-border-strong)',
}

function SystemDiagram() {
  return (
    <svg
      viewBox="0 0 900 300"
      className="w-full"
      role="img"
      aria-label="Data flows from football-data.org into a scheduled ingester inside a Cloudflare Worker, which writes to a D1 database. A read-only API serves the static frontend."
    >
      <defs>
        <linearGradient id="mi-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#16a3ff" />
          <stop offset="52%" stopColor="#4658ff" />
          <stop offset="100%" stopColor="#9b3dff" />
        </linearGradient>
        <marker
          id="mi-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-ga-border-strong)" />
        </marker>
      </defs>

      {/* External feed */}
      <g>
        <rect x="8" y="112" width="150" height="66" rx="10" fill={BOX.fill} stroke={BOX.stroke} />
        <text x="83" y="139" textAnchor="middle" className="ga-machine" fontSize="12" fill="var(--color-ga-text-primary)">
          football-data.org
        </text>
        <text x="83" y="157" textAnchor="middle" fontSize="10.5" fill="var(--color-ga-text-muted)">
          free tier · 10 req/min
        </text>
      </g>

      <line x1="160" y1="145" x2="228" y2="145" stroke="var(--color-ga-border-strong)" strokeWidth="1.5" markerEnd="url(#mi-arrow)" />

      {/* Worker boundary */}
      <rect x="232" y="46" width="300" height="208" rx="12" fill="none" stroke="var(--color-ga-border-subtle)" strokeDasharray="4 4" />
      <text x="248" y="68" fontSize="10" className="ga-machine" fill="var(--color-ga-text-muted)">
        Cloudflare Worker
      </text>

      <g>
        <rect x="256" y="84" width="252" height="62" rx="10" fill={BOX.fill} stroke="url(#mi-brand)" strokeWidth="1.5" />
        <text x="382" y="110" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-ga-text-primary)">
          Scheduled ingester
        </text>
        <text x="382" y="128" textAnchor="middle" fontSize="10.5" fill="var(--color-ga-text-muted)">
          cron · rotation · idempotent upsert
        </text>
      </g>

      <g>
        <rect x="256" y="166" width="252" height="62" rx="10" fill={BOX.fill} stroke={BOX.stroke} />
        <text x="382" y="192" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-ga-text-primary)">
          Read-only API
        </text>
        <text x="382" y="210" textAnchor="middle" fontSize="10.5" fill="var(--color-ga-text-muted)">
          GET routes only
        </text>
      </g>

      {/* Worker to D1 */}
      <line x1="536" y1="115" x2="600" y2="115" stroke="var(--color-ga-border-strong)" strokeWidth="1.5" markerEnd="url(#mi-arrow)" />
      <line x1="600" y1="197" x2="536" y2="197" stroke="var(--color-ga-border-strong)" strokeWidth="1.5" markerEnd="url(#mi-arrow)" />

      <g>
        <rect x="604" y="112" width="140" height="88" rx="10" fill={BOX.fill} stroke={BOX.stroke} />
        <text x="674" y="146" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-ga-text-primary)">
          D1 (SQLite)
        </text>
        <text x="674" y="164" textAnchor="middle" fontSize="10.5" fill="var(--color-ga-text-muted)">
          competitions
        </text>
        <text x="674" y="179" textAnchor="middle" fontSize="10.5" fill="var(--color-ga-text-muted)">
          matches · standings
        </text>
      </g>

      {/* API to frontend */}
      <path d="M 382 230 L 382 268 L 820 268 L 820 200" fill="none" stroke="var(--color-ga-border-strong)" strokeWidth="1.5" markerEnd="url(#mi-arrow)" />

      <g>
        <rect x="750" y="112" width="142" height="88" rx="10" fill={BOX.fill} stroke={BOX.stroke} />
        <text x="821" y="146" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-ga-text-primary)">
          Pages (SPA)
        </text>
        <text x="821" y="164" textAnchor="middle" fontSize="10.5" fill="var(--color-ga-text-muted)">
          static · no secrets
        </text>
        <text x="821" y="179" textAnchor="middle" fontSize="10.5" fill="var(--color-ga-text-muted)">
          this page
        </text>
      </g>

      <text x="290" y="286" fontSize="10" className="ga-machine" fill="var(--color-ga-text-muted)">
        API key lives only here →
      </text>
    </svg>
  )
}

const ROTATION = [
  ['PL', 'PD', 'SA'],
  ['BL1', 'FL1', 'CL'],
]

function RotationDiagram() {
  return (
    <svg
      viewBox="0 0 300 150"
      className="w-full"
      role="img"
      aria-label="Each scheduled run refreshes three competitions, covering all six across two runs."
    >
      {ROTATION.map((pair, index) => {
        const x = index * 150
        return (
          <g key={index}>
            <rect
              x={x + 4}
              y="26"
              width="134"
              height="80"
              rx="10"
              fill="var(--color-ga-surface-2)"
              stroke="var(--color-ga-border-strong)"
            />
            <text
              x={x + 71}
              y="18"
              textAnchor="middle"
              fontSize="10"
              className="ga-machine"
              fill="var(--color-ga-text-muted)"
            >
              run {index + 1}
            </text>
            {pair.map((code, codeIndex) => (
              <text
                key={code}
                x={x + 71}
                y={54 + codeIndex * 24}
                textAnchor="middle"
                fontSize="13"
                fontWeight="600"
                className="ga-machine"
                fill="var(--color-ga-text-primary)"
              >
                {code}
              </text>
            ))}
            <text
              x={x + 71}
              y="140"
              textAnchor="middle"
              fontSize="10"
              fill="var(--color-ga-text-muted)"
            >
              6 calls
            </text>
          </g>
        )
      })}
    </svg>
  )
}
