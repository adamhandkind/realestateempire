-- Phase 4: awards night. Each finished season keeps its champion's title
-- (their haircut, "The Closer") and the roast awards read out in week 52.

ALTER TABLE seasons ADD COLUMN champion_title TEXT;
-- JSON: [{ id, userId, name, color, stat }], champion first.
ALTER TABLE seasons ADD COLUMN awards TEXT;
