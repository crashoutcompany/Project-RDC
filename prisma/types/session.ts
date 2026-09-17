import { Prisma } from "@/generated/prisma/client";

const enrichedSession = {
  include: {
    Game: true,
    mvp: true,
    dayWinners: true,
    sets: {
      include: {
        setWinners: true,
        matches: {
          include: {
            matchWinners: true,
            playerSessions: {
              include: {
                player: true,
                playerStats: { include: { gameStat: true } },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.SessionDefaultArgs;

export type EnrichedSession = Prisma.SessionGetPayload<typeof enrichedSession>;

declare global {
  // Prisma JSON type extension surface.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace PrismaJson {
    type MvpOutput = {
      statName: string;
      sum: number;
      average?: number | undefined;
    }[];
  }
}
