import { handlePrismaOperation } from "prisma/db";

export const getSessionById = async (sessionId: number) => {
  return handlePrismaOperation((prisma) =>
    prisma.session.findUnique({
      where: { sessionId },
      include: {
        Game: { select: { gameName: true } },
        sets: {
          include: {
            setWinners: true,
            matches: {
              include: {
                matchWinners: true,
                playerSessions: {
                  include: {
                    player: true,
                    playerStats: {
                      include: {
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
        dayWinners: true,
        mvp: true,
      },
    }),
  );
};
