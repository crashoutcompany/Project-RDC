import { handlePrismaOperation } from "prisma/db";
import { cacheLife, cacheTag } from "next/cache";
import "server-only";
import {
  approvedSession,
  inApprovedMatch,
  inApprovedPlayerSession,
  inApprovedPlayerStat,
  inApprovedSet,
} from "prisma/lib/approved";

// Session info reached through a match or player session's set.
const setSession = {
  set: {
    select: {
      session: {
        select: {
          sessionId: true,
          sessionName: true,
          date: true,
          Game: { select: { gameName: true } },
        },
      },
    },
  },
};

export const getMember = async (slug: string) => {
  "use cache";
  cacheLife("max");
  cacheTag("getMember", slug);
  return await handlePrismaOperation((prisma) =>
    prisma.player.findFirst({
      where: {
        playerName: {
          equals: slug,
          mode: "insensitive",
        },
      },
      include: {
        matchWins: {
          where: inApprovedMatch,
          select: { matchId: true, ...setSession },
        },
        setWins: { where: inApprovedSet },
        dayWins: { where: approvedSession },
        mvpOf: {
          where: approvedSession,
          select: {
            sessionId: true,
            sessionName: true,
            date: true,
            Game: { select: { gameName: true } },
          },
          orderBy: { date: "desc" },
        },
        playerStats: {
          where: inApprovedPlayerStat,
          include: {
            game: true,
            gameStat: true,
          },
        },
        playerSessions: {
          where: inApprovedPlayerSession,
          select: { matchId: true, ...setSession },
        },
      },
    }),
  );
};
