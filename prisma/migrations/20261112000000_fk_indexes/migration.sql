-- CreateIndex
CREATE INDEX IF NOT EXISTS "game_stats_game_id_idx" ON "game_stats"("game_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sets_session_id_idx" ON "sets"("session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "matches_set_id_idx" ON "matches"("set_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "player_sessions_player_id_idx" ON "player_sessions"("player_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "player_sessions_session_id_idx" ON "player_sessions"("session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "player_sessions_match_id_idx" ON "player_sessions"("match_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "player_sessions_set_id_idx" ON "player_sessions"("set_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "player_stats_player_id_idx" ON "player_stats"("player_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "player_stats_game_id_idx" ON "player_stats"("game_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "player_stats_player_session_id_idx" ON "player_stats"("player_session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "player_stats_stat_id_idx" ON "player_stats"("stat_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_session_userId_idx" ON "user_session"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account"("userId");

