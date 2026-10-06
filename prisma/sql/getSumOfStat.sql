-- @param {Int} $1:playerId
-- @param {String} $2:statName
-- Only counts stats from admin-approved sessions (matches public pages).
SELECT SUM(CAST(player_stats.value AS INTEGER)), AVG(CAST(player_stats.value AS INTEGER))
FROM player_stats
INNER JOIN game_stats ON player_stats.stat_id = game_stats.stat_id
INNER JOIN player_sessions ON player_stats.player_session_id = player_sessions.player_session_id
INNER JOIN sessions ON player_sessions.session_id = sessions.session_id
WHERE player_stats.player_id = $1
  AND game_stats.stat_name::text = $2
  AND sessions.is_approved = true;
