-- Darkroom tables. Additive only — this database is live production.
-- Bound as env.DB (see src/lib/bindings.server.ts) once app.manifest.json
-- sets "db": true.

CREATE TABLE IF NOT EXISTS rolls (
  id           TEXT PRIMARY KEY,              -- short shareable code, e.g. "K7F9Q2"
  name         TEXT NOT NULL,
  capacity     INTEGER NOT NULL DEFAULT 4,    -- seats per roll
  exposures    INTEGER NOT NULL DEFAULT 24,   -- frames per roll
  status       TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'developed'
  created_at   INTEGER NOT NULL,
  developed_at INTEGER
);

CREATE TABLE IF NOT EXISTS members (
  id        TEXT PRIMARY KEY,                 -- secret seat token (identifies a person)
  roll_id   TEXT NOT NULL,
  name      TEXT NOT NULL,
  seat      INTEGER NOT NULL,                 -- 0..capacity-1
  is_host   INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  UNIQUE(roll_id, seat)
);
CREATE INDEX IF NOT EXISTS idx_members_roll ON members(roll_id);

CREATE TABLE IF NOT EXISTS frames (
  id         TEXT PRIMARY KEY,
  roll_id    TEXT NOT NULL,
  member_id  TEXT NOT NULL,
  idx        INTEGER NOT NULL,                -- exposure index 0..exposures-1
  by_name    TEXT NOT NULL,
  photo      TEXT NOT NULL,                   -- base64 JPEG (downscaled client-side)
  created_at INTEGER NOT NULL,
  UNIQUE(roll_id, idx)
);
CREATE INDEX IF NOT EXISTS idx_frames_roll ON frames(roll_id);
