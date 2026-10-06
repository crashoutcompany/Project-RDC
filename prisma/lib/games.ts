"use server";

import { cacheLife, cacheTag } from "next/cache";
import { handlePrismaOperation } from "../db";
import { StatName } from "@/lib/stat-names";
import { getSumOfStat } from "@/generated/prisma/sql";
import { approvedSession, inApprovedPlayerStat } from "./approved";

export type StatEndsWith<
  Suffix extends string,
  Name extends StatName = StatName,
> = Extract<Name, `${string}_${Suffix}`>;

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

export const getGame = async (gameName: string) =>
  await handlePrismaOperation((prisma) =>
    prisma.game.findFirst({
      where: { gameName },
    }),
  );

export const getSumPerStat = async (playerId: number, statName: StatName) =>
  await handlePrismaOperation((prisma) =>
    prisma.$queryRawTyped(getSumOfStat(playerId, statName)),
  );

/** @deprecated */
export const getSetsPerPlayer = async (gameId: number) =>
  await handlePrismaOperation((prisma) =>
    prisma.session.findMany({
      where: { gameId, ...approvedSession },
      include: { sets: { select: { _count: true, matches: true } } },
    }),
  );

export const getWinsPerPlayer = async (gameId: number) =>
  await handlePrismaOperation((prisma) =>
    prisma.game.findFirst({
      where: { gameId },
      select: {
        sessions: {
          where: approvedSession,
          select: {
            sessionId: true,
            sessionName: true,
            sessionUrl: true,
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

export const getMatchesPerGame = async <T extends StatName = StatName>(
  gameId: number,
  statName: StatEndsWith<"POS", T>,
) =>
  await handlePrismaOperation((prisma) =>
    prisma.session.findMany({
      where: { gameId, ...approvedSession },
      select: {
        sets: {
          select: {
            setWinners: true,
            matches: {
              select: {
                matchWinners: true,
                date: true,
                playerSessions: {
                  select: {
                    player: true,
                    playerStats: {
                      where: { gameStat: { statName } },
                      select: { playerStatId: true, value: true },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  );

export const getStatPerPlayer = async (gameId: number, statName: StatName) =>
  await handlePrismaOperation((prisma) =>
    prisma.playerStat.findMany({
      where: { gameId, gameStat: { statName }, ...inApprovedPlayerStat },
      select: { player: true, value: true, statId: true },
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
