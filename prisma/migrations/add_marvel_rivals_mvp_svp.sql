-- Add MVP and SVP stats to Marvel Rivals (gameId = 6)

INSERT INTO game_stats (stat_id, stat_name, game_id, type, created_by, created_at, updated_at)
VALUES
  (36, 'MR_MVP', 6, 'INT', 'SYSTEM', NOW(), NOW()),
  (37, 'MR_SVP', 6, 'INT', 'SYSTEM', NOW(), NOW())
ON CONFLICT (stat_id) DO NOTHING;
