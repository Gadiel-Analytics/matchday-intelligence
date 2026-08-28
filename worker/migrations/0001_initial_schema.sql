-- Matchday Intelligence — initial schema.
--
-- Every table is written only by the scheduled ingester. The public API reads
-- and never writes, so there are no permission or ownership columns: there is
-- no second actor to distinguish.
--
-- Team identity is the feed's own numeric id throughout. v1 keyed on display
-- names via a hand-maintained table and paid for it with four live incidents;
-- see the decision log.

CREATE TABLE IF NOT EXISTS competitions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  area TEXT NOT NULL,
  shape TEXT NOT NULL CHECK (shape IN ('LEAGUE', 'KNOCKOUT')),
  season TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  -- football-data.org's match id. Using it as our primary key is what makes
  -- the ingester idempotent: a rerun converges instead of duplicating.
  id INTEGER PRIMARY KEY,
  competition_code TEXT NOT NULL REFERENCES competitions(code) ON DELETE CASCADE,
  matchday INTEGER,
  stage TEXT,
  kickoff_utc TEXT NOT NULL,
  status TEXT NOT NULL,
  home_team_id INTEGER NOT NULL,
  home_team_name TEXT NOT NULL,
  home_team_crest TEXT,
  away_team_id INTEGER NOT NULL,
  away_team_name TEXT NOT NULL,
  away_team_crest TEXT,
  -- NULL means "no result", which is not the same as a goalless draw. The
  -- columns are deliberately nullable so the distinction survives storage.
  home_score INTEGER,
  away_score INTEGER,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matches_competition_kickoff
  ON matches (competition_code, kickoff_utc);

CREATE INDEX IF NOT EXISTS idx_matches_competition_status
  ON matches (competition_code, status);

CREATE TABLE IF NOT EXISTS standings (
  competition_code TEXT NOT NULL REFERENCES competitions(code) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  team_name TEXT NOT NULL,
  team_crest TEXT,
  played INTEGER NOT NULL,
  won INTEGER NOT NULL,
  drawn INTEGER NOT NULL,
  lost INTEGER NOT NULL,
  goals_for INTEGER NOT NULL,
  goals_against INTEGER NOT NULL,
  goal_difference INTEGER NOT NULL,
  points INTEGER NOT NULL,
  form TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (competition_code, team_id)
);

-- Single row. Holds the rotation cursor and the last run's outcome so the
-- frontend can report pipeline health honestly instead of implying freshness.
CREATE TABLE IF NOT EXISTS sync_status (
  id TEXT PRIMARY KEY,
  last_run_at TEXT,
  run_index INTEGER NOT NULL DEFAULT 0,
  competitions_synced TEXT NOT NULL DEFAULT '[]',
  matches_ingested INTEGER NOT NULL DEFAULT 0,
  unresolved INTEGER NOT NULL DEFAULT 0,
  errors TEXT NOT NULL DEFAULT '[]',
  requests_per_day INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO sync_status (id, last_run_at, updated_at)
VALUES ('global', NULL, datetime('now'));
