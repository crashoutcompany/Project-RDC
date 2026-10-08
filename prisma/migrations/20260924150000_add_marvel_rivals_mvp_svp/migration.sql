-- Add MVP and SVP stats to Marvel Rivals.
-- Looks up the game by name and skips rows that already exist, so it is
-- safe to run against any environment regardless of how far its
-- game_stats.stat_id sequence has already advanced (stat_id is
-- auto-generated, never hardcoded here).
-- Note: on a brand-new database this is a no-op, because prisma/seed.ts
-- already creates these two stats as part of seeding Marvel Rivals.

INSERT INTO "game_stats" ("stat_name", "game_id", "type", "created_by", "created_at", "updated_at")
SELECT 'MR_MVP', g."game_id", 'INT', 'SYSTEM', NOW(), NOW()
FROM "games" g
WHERE g."game_name" = 'Marvel Rivals'
  AND NOT EXISTS (
    SELECT 1 FROM "game_stats" gs
    WHERE gs."game_id" = g."game_id" AND gs."stat_name" = 'MR_MVP'
  );

INSERT INTO "game_stats" ("stat_name", "game_id", "type", "created_by", "created_at", "updated_at")
SELECT 'MR_SVP', g."game_id", 'INT', 'SYSTEM', NOW(), NOW()
FROM "games" g
WHERE g."game_name" = 'Marvel Rivals'
  AND NOT EXISTS (
    SELECT 1 FROM "game_stats" gs
    WHERE gs."game_id" = g."game_id" AND gs."stat_name" = 'MR_SVP'
  );
