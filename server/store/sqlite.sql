-- Dhee SMS — key-value bridge store (SQLite).
-- One row per top-level key of the browser state object (DB.s). See README → "Data store".
-- Keep this file in step with postgres.sql; the column set is identical.

CREATE TABLE IF NOT EXISTS app_state (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,            -- JSON text
  rev         INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL,            -- ISO-8601 UTC
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS app_sessions (
  id          TEXT PRIMARY KEY,         -- SHA-256 of the session token (the token itself is never stored)
  user_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS app_sessions_user ON app_sessions (user_id);
CREATE INDEX IF NOT EXISTS app_sessions_expiry ON app_sessions (expires_at);

CREATE TABLE IF NOT EXISTS app_meta (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,            -- JSON text
  updated_at  TEXT NOT NULL
);
