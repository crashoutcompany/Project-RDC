import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getAllGames } from "prisma/lib/games";
import { getAllSessionsByGame } from "prisma/lib/admin";

/** Approved sessions for every game, so member pages can compute per-game streaks. */
export const getAllGameSessions = async () => {
  "use cache";
  cacheLife("max");
  cacheTag("getAllSessions", "getAllGames");
  const games = await getAllGames();
  if (!games.success || !games.data) return [];

  return await Promise.all(
    games.data.map(async (game) => {
      const result = await getAllSessionsByGame(game.gameId);
      return {
        gameName: game.gameName,
        sessions: result.success && result.data ? result.data : [],
      };
    }),
  );
};
