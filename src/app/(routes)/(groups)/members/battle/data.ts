import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getAllGames } from "prisma/lib/games";
import { getAllSessionsByGame } from "prisma/lib/admin";
import { ARENAS_TAG } from "@/lib/revalidate";
import { toSlug } from "@/lib/rdc-stats";
import type { BattleFeed } from "@/lib/head-to-head";

/** Approved sessions for every game, shaped for `headToHead`. */
export async function getBattleFeeds(): Promise<BattleFeed[]> {
  "use cache";
  cacheLife("max");
  cacheTag(ARENAS_TAG, "getAllSessions", "getAllGames");
  const games = await getAllGames();
  if (!games.success || !games.data) return [];

  const feeds = await Promise.all(
    games.data.map(async (game) => {
      const sessions = await getAllSessionsByGame(game.gameId);
      return {
        slug: toSlug(game.gameName),
        name: game.gameName,
        sessions: sessions.success && sessions.data ? sessions.data : [],
      };
    }),
  );
  return feeds;
}
