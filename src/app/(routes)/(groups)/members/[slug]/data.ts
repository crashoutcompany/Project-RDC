import { handlePrismaOperation } from "prisma/db";
import { cacheLife, cacheTag } from "next/cache";
import "server-only";

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
        matchWins: true,
        setWins: true,
        dayWins: true,
        playerStats: {
          include: {
            game: true,
            gameStat: true,
          },
        },
        playerSessions: {
          include: {
            playerStats: true,
          },
        },
      },
    }),
  );
};
