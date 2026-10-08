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
        matchWins: { where: inApprovedMatch },
        setWins: { where: inApprovedSet },
        dayWins: { where: approvedSession },
        playerStats: {
          where: inApprovedPlayerStat,
          include: {
            game: true,
            gameStat: true,
          },
        },
        playerSessions: {
          where: inApprovedPlayerSession,
          include: {
            playerStats: true,
          },
        },
      },
    }),
  );
};
