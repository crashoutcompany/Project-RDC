import { cacheLife, cacheTag } from "next/cache";
import { handlePrismaOperation } from "../db";
import { approvedSession } from "./approved";

/** Approved session with the fields a public session page renders. Shape stays compatible with `getAllSessionsByGame`. */
export const getApprovedSession = async (sessionId: number) => {
  "use cache";
  cacheLife("max");
  cacheTag("getAllSessions", `session-${sessionId}`);
  return await handlePrismaOperation((prisma) =>
    prisma.session.findFirst({
      where: { sessionId, ...approvedSession },
      select: {
        date: true,
        sessionId: true,
        sessionName: true,
        sessionUrl: true,
        thumbnail: true,
        videoId: true,
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
          orderBy: { setId: "asc" },
        },
      },
    }),
  );
};

/** Ids of every approved session, for static params and the sitemap. */
export const getApprovedSessionIds = async () => {
  "use cache";
  cacheLife("max");
  cacheTag("getAllSessions");
  return await handlePrismaOperation((prisma) =>
    prisma.session.findMany({
      where: approvedSession,
      select: { sessionId: true, date: true },
      orderBy: { date: "asc" },
    }),
  );
};
