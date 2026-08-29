# Developer Handoff

> Canonical onboarding document for Matchday Intelligence.
>
> Status at this handoff: **V1 complete and running in production** (2026-08-29).
> Treat the current `main` branch as the source of truth. The baseline SHA at
> V1 close was `7dcf966a44e14aa0578ef54a600289596be1e623`.

## 1. What this project is

Matchday Intelligence is a public football-data decision-system showcase. It is
deliberately small, read-only, and explicit about uncertainty and architectural
trade-offs.

The product has two data planes:

1. **Live league data** — football-data.org → scheduled Cloudflare Worker → D1
   → GET-only API → React frontend.
2. **Frozen World Cup 2026 archive** — committed TypeScript fixture →
   deterministic survivor/knockout analytics → the same React frontend.

The live plane currently tracks six football-data.org competitions:

- `PL` — Premier League
- `PD` — La Liga
- `SA` — Serie A
- `BL1` — Bundesliga
- `FL1` — Ligue 1
- `CL` — UEFA Champions League

The World Cup archive is intentionally not backed by D1, an API route, or a
cron. It is a finished historical record and must not drift as the live schema
or provider changes.

## 2. Production topology

| Surface | Production resource | Repo config | Deployment |
|---|---|---|---|
| Frontend | `https://matchday.gadielanalytics.com` | `wrangler.jsonc` | Cloudflare Workers Static Assets; Git-connected build from `main` |
| Public API | `https://matchday-api.gadielanalytics.com` | `worker/wrangler.toml` | Cloudflare Worker; explicit Wrangler deployment |
| Database | D1 `matchday` | `worker/wrangler.toml` | Migrations in `worker/migrations/` |
| External feed | football-data.org v4 | `worker/src/sync.ts` | Server-side only |
| Historical archive | committed TypeScript fixture | `src/data/wc2026Archive.ts` | Bundled with frontend |

Current D1 binding:

- binding: `DB`
- database name: `matchday`
- database id: `79111ff2-eaa4-4bb4-8ded-2e16fd930b49`

The only production secret required by the backend Worker is:

- `FOOTBALL_DATA_API_KEY`

Never commit its value. The frontend has no secrets.

## 3. Architectural invariants

These constraints are intentional. Do not remove them casually.

### Public API is read-only by construction

`worker/src/index.ts` refuses every HTTP method except `GET` and `OPTIONS`
before routing.

There is no public mutation route to authenticate.

### Scheduled ingestion is the only D1 writer

Do not add browser- or public-API-driven D1 writes without explicitly revisiting
the security model.

### Provider numeric IDs are canonical identity

Team and match identity comes from football-data.org numeric IDs.

Do not reintroduce display-name-based identity or a silent name-mapping table.

### Unknown is not zero

Missing scores, unavailable provider data, insufficient statistical samples and
unresolved rows must remain distinguishable from valid zero values.

Do not invent placeholder figures merely to keep a panel populated.

### The World Cup archive is frozen

`src/data/wc2026Archive.ts` is a historical fixture, not another live data
source.

Do not move it into D1 merely to unify code paths.

### Frontend and backend have separate Wrangler configs

- frontend: `wrangler.jsonc`
- backend: `worker/wrangler.toml`

Backend deployments must always use the explicit backend config.

Never deploy by passing the backend entry file positionally.

### Ingestion retries must converge

Matches upsert by football-data.org's match ID.

A rerun must update the same logical records rather than create duplicates.

### Pipeline failures remain visible

Scheduled ingestion records errors and unresolved rows into `sync_status`.

Do not turn provider or ingestion failure into fake freshness.

## 4. Repository map

### Frontend

- `src/App.tsx`
  - top-level page composition and data-state wiring.

- `src/components/`
  - reusable UI, brand, provenance and status components.

- `src/sections/Hero.tsx`
  - product thesis and live pipeline pulse.

- `src/sections/LiveMatchday.tsx`
  - live competition surface.

- `src/sections/LeagueComparison.tsx`
  - cross-competition analytics.

- `src/sections/WorldCupArchive.tsx`
  - frozen World Cup survivor/knockout presentation.

- `src/sections/Architecture.tsx`
  - architecture and rotation explanation rendered in-product.

- `src/sections/DecisionLog.tsx`
  - architectural decisions, revisit triggers, incidents and limitations.

- `src/hooks/useMatchdayData.ts`
  - frontend API loading/state boundary.

- `src/lib/apiClient.ts`
  - public API client and endpoint definitions.

- `src/lib/analytics.ts`
  - deterministic league analytics.

- `src/lib/survivorScoring.ts`
  - deterministic archive scoring/elimination engine.

- `src/data/wc2026Archive.ts`
  - frozen historical fixture.

### Backend

- `worker/src/index.ts`
  - GET-only HTTP API and scheduled-handler entrypoint.

- `worker/src/sync.ts`
  - football-data.org client, competition manifest, normalization and rotation.

- `worker/src/scheduledSync.ts`
  - scheduled orchestration, D1 persistence and `sync_status`.

- `worker/migrations/`
  - D1 schema history.

- `worker/wrangler.toml`
  - backend Worker, cron, D1 binding and production variables.

### Platform and quality

- `wrangler.jsonc`
  - frontend Worker Static Assets configuration.

- `.env.example`
  - frontend API-base configuration example.

- `.github/workflows/ci.yml`
  - Node 22 CI.

- `package.json`
  - canonical local, test and deployment commands.

- `public/screenshot-hero.png`
  - production screenshot used by README.

- `public/og-image.png`
  - production social preview.

## 5. Data model

The production schema begins in:

`worker/migrations/0001_initial_schema.sql`

### `competitions`

One row per tracked competition.

Stores:

- provider competition code
- display metadata
- area
- competition shape
- season
- update timestamp

### `matches`

Primary key:

`football-data.org match id`

This makes ingestion retries idempotent.

Scores are nullable because:

`no result yet != 0-0`

### `standings`

Primary key:

`(competition_code, team_id)`

The provider's current `TOTAL` standings table is treated as authoritative.

A successful standings ingest fully replaces that competition's stored
standings.

### `sync_status`

One row:

`id = 'global'`

It stores:

- `last_run_at`
- `run_index`
- competitions synced
- matches ingested
- unresolved rows
- errors
- expected scheduled requests/day

The frontend uses it to communicate pipeline freshness and failure explicitly.

## 6. Ingestion and rate-limit model

Each competition requires two provider calls per refresh:

1. standings
2. matches

`ROTATION_SIZE = 3`.

Therefore one scheduled run costs six provider requests.

All six competitions complete one sweep across two runs.

Production cron configuration is versioned in `worker/wrangler.toml`:

- every five minutes from 11:00 through 23:59 UTC;
- every two hours at 00:00, 02:00, 04:00, 06:00, 08:00 and 10:00 UTC.

The scheduled code also calculates expected requests/day from the assumed
schedule and rotation.

If cron cadence, rotation size or requests-per-competition changes, update the
calculation and its tests at the same time.

Do not allow displayed request-budget information to drift from the real
schedule.

The provider's free-tier scores may themselves be delayed. Faster polling can
reduce the delay between provider publication and Matchday display, but cannot
make the upstream feed real-time.

## 7. Public API contract

The backend exposes:

```text
GET     /api/health
GET     /api/sync-status
GET     /api/competitions/snapshots
GET     /api/competitions/:code
OPTIONS *
```

Anything other than `GET` or `OPTIONS` is rejected with HTTP `405` before
normal route handling.

Successful data endpoints return an envelope containing:

- `ok`
- `data`
- `source`
- `fetchedAt`

CORS exists for browser interoperability. It is not an authorization boundary.

## 8. Bootstrap from a clean clone

Prerequisites:

- Git
- Node.js 22
- npm
- Cloudflare access for production operations
- Wrangler authentication for backend/D1 work
- a football-data.org API key only if exercising provider-backed ingestion

Clone and validate:

```bash
git clone https://github.com/Gadiel-Analytics/matchday-intelligence.git
cd matchday-intelligence

npm ci
npm run typecheck
npm run worker:typecheck
npm run lint
npm test
npm run build
```

Frontend local configuration:

```bash
cp .env.example .env.local
npm run dev
```

`VITE_API_BASE_URL` is public configuration, not a secret.

If it is unset, the frontend is expected to render an explicit disconnected
state rather than placeholder values.

Backend local development:

```bash
npm run worker:dev
```

Provider-backed ingestion requires `FOOTBALL_DATA_API_KEY` to be supplied to
Wrangler using an appropriate local secret mechanism.

Never place it in:

- committed source
- `worker/wrangler.toml`
- a Vite variable
- browser code

## 9. Test and CI baseline

At V1 close the repository contains 37 deterministic tests across:

- analytics
- rotation
- survivor scoring/elimination

GitHub Actions runs on pushes and pull requests targeting `main` and performs:

1. dependency installation
2. frontend TypeScript validation
3. Worker TypeScript validation
4. ESLint
5. tests
6. production build

`main` is protected against:

- branch deletion
- non-fast-forward updates

The current ruleset does not require PRs.

For material API, D1, ingestion, security or infrastructure changes, prefer a
branch and review even though GitHub does not mechanically require one.

## 10. Decision record

`src/sections/DecisionLog.tsx` is part of the project's engineering record, not
only product copy.

Important decisions include:

- read-only by construction
- provider IDs instead of team names
- frozen historical archive
- additive migration strategy in the predecessor
- explicit unknowns
- bounded infrastructure complexity

Each decision includes a `revisit when` condition.

When a future change intentionally reverses one of these choices, update the
decision record instead of silently changing the architecture.

## 11. Historical production lessons

The predecessor system produced several incidents that shaped V1:

- invisible controls after a design-token regression;
- tournament eligibility matching global reference data;
- an incorrect Wrangler invocation creating a second empty service;
- a persistence batch failing without surfacing the error.

The deploy lesson is permanent:

```bash
npm run worker:deploy
```

or:

```bash
npx wrangler deploy --config worker/wrangler.toml
```

Never deploy the backend by passing an entry file positionally.

Always verify Wrangler reports the expected Worker:

`matchday-api`

## 12. Historical predecessor

Matchday succeeded a World Cup production application used to create the frozen
archive.

The predecessor repository is intentionally private because its operational
history contains real-participant material that is not part of this public
showcase.

At V1 close:

- predecessor scheduled polling was retired;
- its Worker was retained as a historical production record;
- its D1 database was retained;
- local-only final-day history was preserved in the private archive branch
  `archive/pre-retirement-local-20260829`;
- the predecessor is not a runtime dependency of Matchday.

Do not re-enable the predecessor as part of normal Matchday maintenance.

## 13. Starting the next phase

Before implementing V1.1 or V2:

1. Pull current `main`.
2. Confirm a clean worktree.
3. Read this document and `docs/OPERATIONS.md`.
4. Inspect the live code/configuration being changed.
5. Do not implement solely from an old project plan or chat transcript.
6. Classify the change:
   - frontend
   - analytics
   - API
   - ingestion
   - D1 schema
   - cron/schedule
   - infrastructure
7. Identify which architectural invariants the change touches.
8. Make the smallest coherent change.
9. Run the relevant checks.
10. Qualify the pushed commit through GitHub CI.
11. For production-affecting changes, run the production smoke checks.
12. Update documentation whenever topology, resource names, API contract,
    schema, secrets, schedule or invariants change.

The repository and current cloud configuration should be sufficient to resume
work without recovering old conversations.

## 14. Definition of done for future work

A production-affecting change is complete only when:

- implementation and documentation agree;
- no secret was committed or exposed to the browser;
- relevant local validation passed;
- GitHub CI is green on the deployed commit;
- the correct Cloudflare resource was deployed;
- the API's read-only boundary still behaves as intended unless a reviewed
  architectural decision explicitly changed it;
- health, sync and frontend smoke checks pass;
- migrations and schedule changes are documented;
- historical archive data was not silently rewritten.

For operational commands and recovery procedures, continue with:

**[`OPERATIONS.md`](OPERATIONS.md)**
