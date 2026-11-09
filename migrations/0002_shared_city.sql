-- Phase 3: the shared city. The live city (listings, bids, feed, every
-- player's game) lives in the city's Durable Object. D1 keeps what outlasts
-- a season: the final standings of every season, champion first.

CREATE TABLE seasons (
  city_id               TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  season                INTEGER NOT NULL,
  finished_at           INTEGER NOT NULL,
  champion_user_id      TEXT,
  champion_name         TEXT,
  champion_color        TEXT,
  champion_character_id TEXT,
  champion_net_worth    INTEGER,
  -- JSON: [{ userId, name, color, characterId, rank, netWorth, place }]
  standings             TEXT NOT NULL,
  PRIMARY KEY (city_id, season)
);
