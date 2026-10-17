import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { handlePrismaOperation } from "prisma/db";
import { approvedSession } from "prisma/lib/approved";
import { ARENAS_TAG } from "@/lib/revalidate";
import type { StreakSession } from "@/lib/streaks";

/**
 * Approved sessions for every game, grouped by game name, with only the
 * fields day-win streaks need. Member pages use it for per-game streaks.
 */
export const getAllGameSessions = async () => {
  "use cache";
  cacheLife("max");
  cacheTag("getAllSessions", "getAllGames", ARENAS_TAG);
  const result = await handlePrismaOperation((prisma) =>
    prisma.session.findMany({
      where: approvedSession,
      select: {
        sessionId: true,
        sessionName: true,
        date: true,
        Game: { select: { gameName: true } },
        dayWinners: { select: { playerName: true } },
      },
      orderBy: { date: "asc" },
    }),
  );
  if (!result.success || !result.data) return [];

  const byGame = new Map<string, StreakSession[]>();
  for (const { Game, ...session } of result.data) {
    const sessions = byGame.get(Game.gameName) ?? [];
    sessions.push(session);
    byGame.set(Game.gameName, sessions);
  }
  return [...byGame].map(([gameName, sessions]) => ({ gameName, sessions }));
};
