import { Prisma } from "@/generated/prisma/client";

export const playerStatWithStatName = {
  include: {
    gameStat: {
      select: {
        statName: true,
      },
    },
  },
} satisfies Prisma.PlayerStatDefaultArgs;

export type PlayerStatWithStatName = Prisma.PlayerStatGetPayload<
  typeof playerStatWithStatName
>;
