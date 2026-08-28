# Matchday Intelligence

**A read-only football data pipeline, built and operated as a decision system.**
by [Gadiel Analytics](https://gadielanalytics.com)

Six European competitions are ingested from a single feed on a rotating schedule,
stored at the edge, and served through an API that has no write routes. On top of
that sit two things a scoreboard does not give you: comparative analysis across
competitions, and a written record of every architectural trade-off — including
the ones that were wrong the first time.

---

## The problem

Football data is easy to display and hard to be honest about.

A public feed gives you fixtures, results and tables. Turning that into something
trustworthy means answering questions the feed does not: how stale is this number,
what happens when the source is late, which figures are real and which are
artefacts of a three-match sample, and what should the interface say when it does
not know.

This project is the answer to those questions, running in public, on free-tier
infrastructure, at zero monthly cost.

## Two competition shapes, two data planes

League football resolves by table. Knockout football resolves by elimination.
Matchday presents both, but they are intentionally backed by different data planes:

| Shape | Source | Data plane | Rendered as |
|---|---|---|---|
| **League** | Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League | Live football-data.org → Worker → D1 | Table, form, comparative metrics |
| **Knockout** | World Cup 2026 survivor pool | Frozen static archive | Bracket, ownership, survival |

The live Worker currently ingests league-format competition data only. The World
Cup case study is frozen as static data so the historical outcome cannot drift.
Champions League matches retain their feed-provided stage labels, but the current
competition model remains `LEAGUE`; the live ingester does not switch shapes
automatically.

---

## What is worth looking at

| | |
|---|---|
| **`src/lib/analytics.ts`** | Derived competition metrics. Every function returns `null` rather than `0` when the sample cannot support the statistic. |
| **`src/lib/survivorScoring.ts`** | The scoring and elimination engine, carried over unchanged from the production tournament. Pure, no I/O, fully tested against the frozen archive. |
| **`worker/src/sync.ts`** | Ingestion keyed on the feed's numeric team ids. The predecessor keyed on display names and paid for it — see the decision log. |
| **`worker/src/index.ts`** | The API. Note what is absent: there is no `POST`, `PATCH` or `DELETE` handler anywhere in the file. |
| **`src/data/wc2026Archive.ts`** | The finished tournament, frozen as static data so the case study cannot drift. |

---

## Architecture

```
football-data.org ──► Scheduled ingester ──► D1 (SQLite at the edge)
   free tier             (Cloudflare Worker)          │
   10 req/min             holds the only              │
                          credential                  ▼
                                              Read-only API ──► Pages (static SPA)
                                               GET routes only    no secrets
```

Four moving parts. No queue, no cache layer, no orchestration — the load does not
justify them, and saying so is part of the design.

**Rotation, not a burst.** The feed allows ten requests per minute. Six
competitions needing two endpoints each is twelve calls, which would exceed the
ceiling if issued together. Each scheduled run therefore refreshes the next three
competitions in sequence: six calls per run, leaving four requests per minute of
headroom. Each competition is refreshed roughly every ten minutes during the
11:00–23:59 UTC match window and every four hours overnight.

**Read-only by construction.** The public deployment cannot be written to. Not
"is protected from being written to" — there is no write route to protect. The
ingester is the only writer, it runs inside the Worker, and the API credential
never reaches a browser. This is the security posture and it is also the reason
the repository can be public without a hardening exercise.

---

## Running it

```bash
npm install
npm run dev            # frontend, expects VITE_API_BASE_URL
npm test               # 37 tests across the engines and the ingester
npm run build
```

With no `VITE_API_BASE_URL` set, the frontend runs and every data panel states
that the pipeline is not configured. That is the intended behaviour: the
alternative — placeholder numbers — would be a dashboard that lies when its
source is unavailable.

### Backend

```bash
npx wrangler d1 create matchday      # then paste the id into worker/wrangler.toml
npm run d1:migrate:remote
npx wrangler secret put FOOTBALL_DATA_API_KEY --config worker/wrangler.toml
npm run worker:deploy
```

A free API key is available at [football-data.org](https://www.football-data.org/client/register).

---

## Honest limits

- **Not real-time.** Scores on the feed's free tier are delayed at source. Polling
  more often narrows the gap between publication and display; it cannot make the
  publication itself instant.
- **Not built for write concurrency.** One scheduled writer, last write wins.
  Correct here, wrong for anything with many concurrent writers.
- **Derived metrics are sample-sensitive.** Early-season figures move sharply on a
  single result. They are shown with their sample size rather than smoothed.
- **Six competitions, not twelve.** The feed offers twelve free. Coverage is capped
  so the rotation stays well inside the rate ceiling.

---

## Provenance

This is the second version of a system that ran in production during the 2026
World Cup with eight real participants, across four knockout rounds, on a fixed
external schedule. That run is preserved as the archived case study on the site.

Participant names in the archive are pseudonymous. The author is named; the other
seven participants were private individuals and appear under AI model names. Team
assignments, scores, points and outcomes are unmodified.

Four production incidents from that run — invisible buttons after a token
regression, an eligibility filter that matched 55 teams instead of 16, a deploy
that silently created a second empty service, and a save path that failed without
surfacing an error — are documented on the site with their root causes, because
the cause is the part that generalises.

---

## Licence

MIT. Match data belongs to [football-data.org](https://www.football-data.org) and
is subject to their terms.
