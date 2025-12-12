import { Prisma } from "@/generated/prisma/client";

const enrichedMatch = {
  include: {
    playerSessions: {
      include: {
        player: true,
        playerStats: true,
      },
    },
  },
} satisfies Prisma.MatchDefaultArgs;

export type EnrichedMatch = Prisma.MatchGetPayload<typeof enrichedMatch>;
