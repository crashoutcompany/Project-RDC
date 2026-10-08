import { cacheLife, cacheTag } from "next/cache";
import { handlePrismaOperation } from "../db";

export const getAllSessions = async () => {
  "use cache";
  cacheLife("max");
  cacheTag("getAllSessions");
  return await handlePrismaOperation((prisma) =>
    prisma.session.findMany({
      include: { Game: { select: { gameName: true } } },
    }),
  );
};

export const getAllSessionsByGame = async (gameId: number) => {
  "use cache";
  cacheLife("max");
  cacheTag("getAllSessions", gameId.toString());
  return await handlePrismaOperation((prisma) =>
    prisma.session.findMany({
      where: { gameId },
      select: {
        date: true,
        sessionId: true,
        sessionName: true,
        sessionUrl: true,
        thumbnail: true,
        dayWinners: true,
        mvp: true,
        mvpDescription: true,
        mvpStats: true,
        Game: { select: { gameName: true } },
        sets: {
          select: {
            setWinners: true,
            matches: {
              select: {
                matchWinners: true,
                playerSessions: {
                  select: {
                    playerStats: {
                      select: {
                        value: true,
                        player: true,
                        gameStat: {
                          select: {
                            statName: true,
                            statId: true,
                            type: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { date: "asc" },
    }),
  );
};
