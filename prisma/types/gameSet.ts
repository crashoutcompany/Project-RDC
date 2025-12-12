import { Prisma } from "@/generated/prisma/client";

const enrichedGameSet = {
  include: {
    matches: {
      include: {
        playerSessions: {
          include: {
            playerStats: true,
            player: {
              select: {
                playerName: true,
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.GameSetDefaultArgs;

export type EnrichedGameSet = Prisma.GameSetGetPayload<typeof enrichedGameSet>;
