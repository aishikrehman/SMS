-- Dhee SMS — key-value bridge store (PostgreSQL).
-- One row per top-level key of the browser state object (DB.s). See README → "Data store".
-- This key-value table is the bridge toward a fully normalised schema (one table per collection).
-- Table names are prefixed app_ so they never clash with such tables when both live in one database.

CREATE TABLE IF NOT EXISTS app_state (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  rev         INTEGER NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL,
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS app_sessions (
  id          TEXT PRIMARY KEY,         -- SHA-256 of the session token (the token itself is never stored)
  user_id     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS app_sessions_user ON app_sessions (user_id);
CREATE INDEX IF NOT EXISTS app_sessions_expiry ON app_sessions (expires_at);

CREATE TABLE IF NOT EXISTS app_meta (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL
);
