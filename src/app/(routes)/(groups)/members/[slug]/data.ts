import { handlePrismaOperation } from "prisma/db";
import { cacheLife, cacheTag } from "next/cache";
import "server-only";

/**
 * Loads a member by slug with win/session relations (cached for the static shell).
 *
 * @param slug - Member name slug (case-insensitive)
 * @returns Prisma operation result for the player
 */
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
