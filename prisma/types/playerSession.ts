import { Prisma } from "@/generated/prisma/client";

// Things we need for each Mario Kart Session
// RDC names, stat names and values

const playerSessionWithPlayerStats = {
  include: {
    match: true,
    player: true,
    playerStats: true,
  },
} satisfies Prisma.PlayerSessionDefaultArgs;

export type EnrichedPlayerSession = Prisma.PlayerSessionGetPayload<
  typeof playerSessionWithPlayerStats
>;
