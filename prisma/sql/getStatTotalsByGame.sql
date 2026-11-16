-- @param {Int} $1:gameId
-- SUM and AVG of every INT stat of a game, per player, in one pass.
-- Only counts stats from admin-approved sessions (matches public pages).
-- Only INT stats are numeric; the CASE keeps a stray non-numeric value from
-- failing the CAST regardless of the order Postgres evaluates the filters in.
SELECT
  player_stats.player_id AS "playerId",
  game_stats.stat_name::text AS "statName",
  SUM(CAST(CASE WHEN player_stats.value ~ '^-?[0-9]+$' THEN player_stats.value END AS INTEGER)) AS "sum",
  AVG(CAST(CASE WHEN player_stats.value ~ '^-?[0-9]+$' THEN player_stats.value END AS INTEGER)) AS "avg"
FROM player_stats
INNER JOIN game_stats ON player_stats.stat_id = game_stats.stat_id
INNER JOIN player_sessions ON player_stats.player_session_id = player_sessions.player_session_id
INNER JOIN sessions ON player_sessions.session_id = sessions.session_id
WHERE game_stats.game_id = $1
  AND game_stats.type = 'INT'
  AND sessions.is_approved = true
GROUP BY player_stats.player_id, game_stats.stat_name;
