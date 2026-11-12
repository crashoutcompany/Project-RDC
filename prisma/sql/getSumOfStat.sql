-- @param {Int} $1:playerId
-- @param {String} $2:statName
-- Only counts stats from admin-approved sessions (matches public pages).
-- Only INT stats are numeric; the CASE keeps a stray non-numeric value from
-- failing the CAST regardless of the order Postgres evaluates the filters in.
SELECT
  SUM(CAST(CASE WHEN player_stats.value ~ '^-?[0-9]+$' THEN player_stats.value END AS INTEGER)),
  AVG(CAST(CASE WHEN player_stats.value ~ '^-?[0-9]+$' THEN player_stats.value END AS INTEGER))
FROM player_stats
INNER JOIN game_stats ON player_stats.stat_id = game_stats.stat_id
INNER JOIN player_sessions ON player_stats.player_session_id = player_sessions.player_session_id
INNER JOIN sessions ON player_sessions.session_id = sessions.session_id
WHERE player_stats.player_id = $1
  AND game_stats.stat_name::text = $2
  AND game_stats.type = 'INT'
  AND sessions.is_approved = true;
