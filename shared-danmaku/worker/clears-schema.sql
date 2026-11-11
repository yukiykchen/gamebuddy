CREATE TABLE IF NOT EXISTS clears (
  run_id TEXT PRIMARY KEY,
  character TEXT NOT NULL,
  ascension INTEGER NOT NULL,
  game_mode TEXT NOT NULL,
  started_at INTEGER,
  observed_duration_seconds INTEGER NOT NULL,
  combat_save_load INTEGER NOT NULL CHECK (combat_save_load IN (0, 1)),
  final_deck TEXT NOT NULL,
  final_relics TEXT NOT NULL,
  selected_events TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '匿名人士',
  player_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clears_leaderboard
  ON clears(character, ascension, game_mode, observed_duration_seconds, created_at, run_id);

CREATE TABLE IF NOT EXISTS leaderboard_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1))
);

INSERT OR IGNORE INTO leaderboard_config (id, enabled) VALUES (1, 0);
