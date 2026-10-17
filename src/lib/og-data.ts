import "server-only";
import { handlePrismaOperation } from "prisma/db";
import { cacheLife, cacheTag } from "next/cache";
import {
  approvedSession,
  inApprovedMatch,
  inApprovedSet,
} from "prisma/lib/approved";

/** Lean member read for the OG card: approved win counts only, no stats or sessions. */
export const getMemberCardData = async (slug: string) => {
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
      select: {
        playerName: true,
        _count: {
          select: {
            matchWins: { where: inApprovedMatch },
            setWins: { where: inApprovedSet },
            dayWins: { where: approvedSession },
          },
        },
      },
    }),
  );
};
