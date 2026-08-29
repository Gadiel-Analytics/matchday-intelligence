# Operations Runbook

This is the operational companion to
[`DEVELOPER_HANDOFF.md`](DEVELOPER_HANDOFF.md).

Use it for deployments, database changes, secrets, production verification,
rollback and troubleshooting.

## 1. Production resources

### Frontend

- service name: `matchday`
- custom domain: `https://matchday.gadielanalytics.com`
- configuration: `wrangler.jsonc`
- runtime model: Cloudflare Workers Static Assets
- source: GitHub `main`
- build command: `npm run build`
- output: `dist`

### Backend

- Worker name: `matchday-api`
- custom domain: `https://matchday-api.gadielanalytics.com`
- configuration: `worker/wrangler.toml`
- environment: `production`

### D1

- database: `matchday`
- binding: `DB`
- id: `79111ff2-eaa4-4bb4-8ded-2e16fd930b49`
- migrations: `worker/migrations/`

### Provider

- football-data.org v4
- secret name: `FOOTBALL_DATA_API_KEY`

## 2. Authentication preflight

Before production Worker or D1 operations:

```bash
npx wrangler whoami
```

Do not continue if the authenticated Cloudflare account is not the one that owns
the Matchday resources.

For GitHub:

```bash
gh auth status
```

## 3. Standard validation

For material TypeScript or runtime changes:

```bash
npm ci
npm run typecheck
npm run worker:typecheck
npm run lint
npm test
npm run build
```

For documentation-only or binary-asset-only changes, do not rerun the entire
suite unnecessarily.

At minimum:

```bash
git diff --check
```

GitHub CI remains the final repository-level qualification gate.

## 4. Frontend deployment

The production frontend is connected to GitHub and deploys from `main`.

Normal flow:

```text
commit
  ↓
push main
  ↓
GitHub CI
  ↓
Cloudflare Git-connected frontend build
  ↓
matchday.gadielanalytics.com
```

Frontend configuration is in:

`wrangler.jsonc`

Production API configuration baked into the frontend:

```text
VITE_API_BASE_URL=https://matchday-api.gadielanalytics.com
```

There must be no trailing slash.

### Manual frontend deployment

Use only when intentionally bypassing the Git-connected build path for recovery
or diagnosis:

```bash
npm run build
npx wrangler deploy --config wrangler.jsonc
```

Verify the reported target is:

`matchday`

Do not use the backend Wrangler config for frontend deployment.

## 5. Backend deployment

Normal backend deployment:

```bash
npm run worker:deploy
```

Equivalent explicit command:

```bash
npx wrangler deploy --config worker/wrangler.toml
```

Always verify Wrangler reports:

```text
matchday-api
```

Never use:

```bash
wrangler deploy worker/src/index.ts
```

or any other positional-entry-file deployment.

The predecessor application once created an unintended second service through an
ambiguous deployment invocation. Explicit config paths are now an operational
invariant.

## 6. Backend secret management

Production secret name:

`FOOTBALL_DATA_API_KEY`

Set or rotate it with:

```bash
npx wrangler secret put \
  FOOTBALL_DATA_API_KEY \
  --config worker/wrangler.toml
```

Paste the value only into Wrangler's secure prompt.

Never:

- paste the value into an issue or commit;
- add it under `[vars]`;
- put it into `.env.example`;
- expose it through `VITE_*`;
- log it.

After rotation, run the API and sync smoke checks in this document.

## 7. D1 migrations

Migration directory:

`worker/migrations/`

Initial schema:

`0001_initial_schema.sql`

### Policy

Production migrations are forward-only.

Do not edit a migration that has already been applied to production.

For a schema change, create a new monotonically numbered migration, for example:

```text
worker/migrations/0002_add_example.sql
```

Review the SQL before applying it.

Apply remote migrations with:

```bash
npm run d1:migrate:remote
```

Equivalent command:

```bash
npx wrangler d1 migrations apply \
  matchday \
  --remote \
  --config worker/wrangler.toml
```

After a migration:

1. deploy backend code if the new schema is required by it;
2. verify `/api/health`;
3. verify `/api/sync-status`;
4. verify `/api/competitions/snapshots`;
5. inspect any migration-specific behavior.

### Rollback policy

Do not attempt to rewrite D1 migration history.

If a production migration needs correction, prefer a new corrective migration.

For destructive or irreversible data changes, take explicit recovery planning
outside the normal release path before applying them.

## 8. Cron and ingestion changes

Production schedule is in:

`worker/wrangler.toml`

Current cadence:

```text
*/5 11-23 * * *
0 0,2,4,6,8,10 * * *
```

One run refreshes three competitions.

Each competition uses two provider calls:

- standings
- matches

Therefore one run uses six calls.

If you change:

- cron cadence;
- number of tracked competitions;
- `ROTATION_SIZE`;
- number of provider requests per competition;

also review:

`worker/src/scheduledSync.ts`

Specifically, keep the expected request/day calculation aligned with the real
schedule.

Run rotation tests after any rotation change.

## 9. Production smoke tests

Set:

```bash
API="https://matchday-api.gadielanalytics.com"
SITE="https://matchday.gadielanalytics.com"
```

### API health

```bash
curl -fsS "$API/api/health"
```

Expected shape:

```json
{
  "ok": true,
  "schemaVersion": "1.0.0",
  "environment": "production",
  "readOnly": true
}
```

### Read-only boundary

```bash
curl -sS \
  -o /tmp/matchday-post.json \
  -w "%{http_code}\n" \
  -X POST \
  "$API/api/competitions/snapshots"

cat /tmp/matchday-post.json
rm -f /tmp/matchday-post.json
```

Expected:

```text
405
```

Body:

```json
{
  "ok": false,
  "error": "This API is read-only."
}
```

### Sync status

```bash
curl -fsS "$API/api/sync-status"
```

Check:

- `ok` is true;
- `lastRunAt` is present after ingestion has run;
- `errors` is empty in a healthy run;
- `unresolved` is understood rather than silently ignored;
- request-budget reporting is plausible for the configured schedule.

### Six competition snapshots

```bash
curl -fsS "$API/api/competitions/snapshots"
```

A normal production response should contain six tracked competitions:

```text
PL
PD
SA
BL1
FL1
CL
```

Do not assert that every competition always has recent or upcoming matches.
Competition state legitimately varies by season and provider publication.

### Frontend

```bash
curl -fsS "$SITE/" | grep -q '<div id="root"></div>'
```

Confirm the deployed JavaScript bundle references:

```text
https://matchday-api.gadielanalytics.com
```

Also visually inspect production for changes affecting layout, provenance,
unknown-state rendering or archive presentation.

## 10. API endpoint inventory

Public routes:

```text
GET /api/health
GET /api/sync-status
GET /api/competitions/snapshots
GET /api/competitions/:code
```

Browser preflight:

```text
OPTIONS
```

Any future route addition should explicitly answer:

1. Why is the route needed?
2. Is it still read-only?
3. Does it alter the public security model?
4. Does it expose a new data source?
5. Does frontend state handling need a new failure/unknown state?

A mutation route is an architecture change, not a routine endpoint addition.

## 11. Frontend rollback

Because the frontend deploys from Git history, prefer a normal revert rather than
rewriting `main`.

Example:

```bash
git revert <bad-commit>
git push origin main
```

Then:

1. wait for CI;
2. wait for the Cloudflare Git deployment;
3. verify production.

Do not force-push `main`.

The repository ruleset blocks non-fast-forward updates.

## 12. Backend rollback

For a bad backend code/config change:

```bash
git revert <bad-commit>
git push origin main
npm run worker:deploy
```

Then run:

- health
- read-only boundary
- sync status
- snapshots

Do not assume reverting Git automatically redeploys the backend Worker.

The backend deployment remains an explicit operation.

## 13. Database rollback

D1 is not treated like stateless application code.

Do not:

- reset migration history;
- delete production tables to imitate a rollback;
- rewrite an applied migration.

Use a corrective forward migration unless an explicitly planned recovery process
requires something else.

## 14. Troubleshooting

### Frontend loads but all live panels are unavailable

Check:

1. frontend bundle contains the correct `VITE_API_BASE_URL`;
2. `GET /api/health`;
3. `GET /api/sync-status`;
4. browser network/CORS errors.

Do not replace unavailable values with fake data to make the page appear healthy.

### Health works but live data is stale

Check:

```bash
curl -fsS \
  https://matchday-api.gadielanalytics.com/api/sync-status
```

Review:

- `lastRunAt`
- `competitionsSynced`
- `errors`
- `unresolved`

Then inspect Cloudflare Worker scheduled invocation logs.

### One competition is missing

Check the tracked manifest in:

`worker/src/sync.ts`

Then determine whether:

- the competition row exists;
- the provider endpoint succeeds;
- normalization rejected rows;
- the latest rotation actually included that competition.

Do not add a name alias as the first response to an identity issue.

### Provider call fails

The scheduled job is designed to record errors rather than throw the entire
invocation away.

Check `sync_status.errors` and Worker logs.

Confirm the secret exists without exposing its value.

### Deployment reports an unexpected Worker name

Stop.

Do not continue or attempt to repair by repeatedly deploying.

Expected backend target:

`matchday-api`

Expected frontend target:

`matchday`

Verify which Wrangler config was used.

### D1 appears empty after deploy

Do not create another database immediately.

First verify:

- Worker target
- config path
- binding name
- D1 database ID

An unintended second service/database can make a successful deployment appear
to have lost data.

## 15. Historical predecessor state

The V1 World Cup predecessor is intentionally private and is not part of the
Matchday runtime.

At Matchday V1 close:

- predecessor cron polling was removed;
- its historical Worker remains available;
- its D1 database remains available;
- its repository is private;
- local-only final-day history is preserved under:
  `archive/pre-retirement-local-20260829`.

Do not delete or reactivate those resources during ordinary Matchday work.

They are historical evidence, not active dependencies.

## 16. Release checklist

For a frontend-only application change:

- [ ] clean starting worktree
- [ ] relevant local checks
- [ ] `git diff --check`
- [ ] commit/push
- [ ] GitHub CI green
- [ ] Cloudflare frontend deployment observed
- [ ] production UI smoke

For backend or ingestion changes:

- [ ] clean starting worktree
- [ ] Worker typecheck
- [ ] relevant tests
- [ ] lint/build as applicable
- [ ] commit/push
- [ ] GitHub CI green
- [ ] explicit backend deploy with `worker/wrangler.toml`
- [ ] correct Worker name reported
- [ ] API health
- [ ] 405 write-boundary smoke
- [ ] sync-status smoke
- [ ] six-competition snapshot smoke

For D1 schema changes:

- [ ] new migration file; no rewrite of applied migration
- [ ] SQL reviewed
- [ ] migration applied to intended D1
- [ ] backend deployed if required
- [ ] API smoke
- [ ] migration-specific verification
- [ ] documentation updated

For cron changes:

- [ ] schedule reviewed in UTC
- [ ] rate-limit implications calculated
- [ ] expected requests/day updated
- [ ] rotation tests pass
- [ ] Worker redeployed
- [ ] scheduled behavior verified

## 17. What must stay documented

Update these docs whenever any of the following changes:

- production domains
- Cloudflare service names
- D1 name/id/binding
- deployment mechanism
- API endpoints
- secret names
- tracked competition manifest
- cron schedule
- rate-limit assumptions
- database schema/migration policy
- read/write security boundary
- frozen archive policy
- major architectural decision
- major production incident

A future developer should be able to understand and operate the current system
from the repository without reconstructing its history from external
conversations.
