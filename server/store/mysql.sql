-- Dhee SMS — key-value bridge store (MySQL 5.7+ / 8.x and MariaDB 10.3+).
-- One row per top-level key of the browser state object (DB.s). See README → "Data store".
-- Keep this file in step with sqlite.sql / postgres.sql; the column set is identical.
-- utf8mb4 + utf8mb4_unicode_ci everywhere (Bangla text). Values are JSON text in LONGTEXT
-- (not the JSON type: MariaDB's JSON is only an alias and LONGTEXT behaves the same on both).
-- Keys, session ids and user ids use utf8mb4_bin so "users" and "Users" stay distinct (exact match, like SQLite).
-- Timestamps are ISO-8601 UTC strings, exactly as in SQLite. `key` is a reserved word: always quote it.
-- Statements are separated by ";" at the end of a line (the driver splits on that).

CREATE TABLE IF NOT EXISTS app_state (
  `key`       VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  value       LONGTEXT NOT NULL,
  rev         INT NOT NULL DEFAULT 1,
  updated_at  VARCHAR(40) NOT NULL,
  updated_by  VARCHAR(191) NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_sessions (
  id          VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,     -- SHA-256 of the session token (the token itself is never stored)
  user_id     VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  created_at  VARCHAR(40) NOT NULL,
  expires_at  VARCHAR(40) NOT NULL,
  ip          VARCHAR(64) NULL,
  user_agent  TEXT NULL,
  PRIMARY KEY (id),
  KEY app_sessions_user (user_id),
  KEY app_sessions_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_meta (
  `key`       VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  value       LONGTEXT NOT NULL,
  updated_at  VARCHAR(40) NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
