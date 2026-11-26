import { cacheLife, cacheTag } from "next/cache";
import { handlePrismaOperation } from "../db";
import { getStatTotalsByGame as getStatTotalsByGameSql } from "@/generated/prisma/sql";
import { approvedSession } from "./approved";

// Cache is used for deduping
// unstable is used for time based caching
// perks of using this method is we can invalidate certain paths.

export const getAllGames = async () => {
  "use cache";
  cacheLife("max");
  cacheTag("getAllGames");
  return await handlePrismaOperation(
    async (prisma) => await prisma.game.findMany(),
  );
};

/** Sum and average of every INT stat of a game, per player, in one query. */
export const getStatTotalsByGame = async (gameId: number) =>
  await handlePrismaOperation((prisma) =>
    prisma.$queryRawTyped(getStatTotalsByGameSql(gameId)),
  );

export const getWinsPerPlayer = async (gameId: number) =>
  await handlePrismaOperation((prisma) =>
    prisma.game.findFirst({
      where: { gameId },
      select: {
        sessions: {
          where: approvedSession,
          orderBy: { date: "desc" },
          select: {
            sessionId: true,
            sessionName: true,
            sessionUrl: true,
            date: true,
            dayWinners: true,
            sets: {
              select: {
                setId: true,
                matches: { select: { matchId: true, matchWinners: true } },
                setWinners: true,
              },
            },
          },
        },
      },
    }),
  );

export const getAllGameStats = async () => {
  "use cache";
  cacheLife("max");
  cacheTag("getAllGameStats");
  return await handlePrismaOperation((prisma) =>
    prisma.gameStat.findMany({ select: { statName: true, statId: true } }),
  );
};
