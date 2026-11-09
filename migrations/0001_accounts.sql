-- Phase 2: accounts, invites, cities, agents and cloud saves.
-- Times are unix milliseconds. Tokens are never stored, only their SHA-256.

CREATE TABLE users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  created_at         INTEGER NOT NULL,
  -- Set once by the 18+ confirmation. NULL means not confirmed yet.
  adult_confirmed_at INTEGER
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- One row per emailed login link. Single use, short lived.
CREATE TABLE login_tokens (
  token_hash        TEXT PRIMARY KEY,
  email             TEXT NOT NULL,
  -- The invite the person arrived with, claimed when the link is used.
  invite_token_hash TEXT,
  ip                TEXT,
  created_at        INTEGER NOT NULL,
  expires_at        INTEGER NOT NULL,
  used_at           INTEGER
);
CREATE INDEX login_tokens_email ON login_tokens(email, created_at);
CREATE INDEX login_tokens_ip ON login_tokens(ip, created_at);

CREATE TABLE cities (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  -- Season number; Phase 3's reset bumps it.
  season     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE city_members (
  city_id   TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN ('owner', 'player')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (city_id, user_id)
);
CREATE INDEX city_members_user ON city_members(user_id);

CREATE TABLE invites (
  id         TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  city_id    TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  -- Optional: lock the invite to one address.
  email      TEXT,
  note       TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by    TEXT REFERENCES users(id),
  used_at    INTEGER,
  revoked_at INTEGER
);
CREATE INDEX invites_city ON invites(city_id);

-- A player's agent in a city: the identity that outlasts any one save.
CREATE TABLE agents (
  city_id      TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL,
  character_id TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (city_id, user_id),
  UNIQUE (city_id, color)
);

-- The game itself. `state` is engine toWire() text; the rest is copied out of
-- it on every write so the leaderboard never has to parse JSON.
CREATE TABLE saves (
  city_id    TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  state      TEXT NOT NULL,
  week       INTEGER NOT NULL,
  cash       INTEGER NOT NULL,
  net_worth  INTEGER NOT NULL,
  rank       TEXT NOT NULL,
  game_over  INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (city_id, user_id)
);
CREATE INDEX saves_board ON saves(city_id, net_worth DESC);
