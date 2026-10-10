import prisma from "prisma/db";
import type { PrismaClient } from "@/generated/prisma/client";
import type { DraftSession } from "./build-draft";
import { HARVESTER_AUTHOR, writeDraftSession } from "./write-draft";

const db = vi.mocked(prisma, { deep: true });

const video = {
  videoId: "Opw1cTW5Q68",
  title: "BENCH PLAYERS TALKING LIKE STARTERS",
  url: "https://www.youtube.com/watch?v=Opw1cTW5Q68",
  thumbnail: "https://i.ytimg.com/vi/Opw1cTW5Q68/maxresdefault.jpg",
  date: new Date("2024-12-07T22:23:43Z"),
};

const draft: DraftSession = {
  sets: [
    {
      winnerIds: [3],
      matches: [
        {
          match: 1,
          timestampSec: 610,
          imagePath: "match-01.png",
          winnerIds: [3],
          needsReview: false,
          players: [
            {
              playerId: 3,
              name: "Ben",
              teamKey: "BluePlayers",
              stats: [
                { stat: "RL_GOALS", statValue: "2" },
                { stat: "NOT_A_STAT", statValue: "9" },
              ],
            },
          ],
        },
      ],
    },
  ],
  skipped: [],
  warnings: [],
};

const write = (d: DraftSession = draft) =>
  writeDraftSession({
    prisma: prisma as unknown as PrismaClient,
    gameId: 2,
    video,
    draft: d,
  });

test("saves an unapproved session owned by the harvester", async () => {
  db.gameStat.findMany.mockResolvedValue([
    { statId: 12, statName: "RL_GOALS" },
  ] as never);

  await expect(write()).resolves.toEqual({ status: "created", sessionId: 1 });

  expect(db.session.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      gameId: 2,
      videoId: "Opw1cTW5Q68",
      isApproved: false,
      createdBy: HARVESTER_AUTHOR,
    }),
  });
  expect(db.gameSet.create).toHaveBeenCalledWith({
    data: { sessionId: 1, setWinners: { connect: [{ playerId: 3 }] } },
  });
  // Unknown stat names are dropped rather than failing the whole session.
  expect(db.playerStat.createMany).toHaveBeenCalledWith({
    data: [
      expect.objectContaining({ playerId: 3, statId: 12, value: "2", gameId: 2 }),
    ],
  });
});

test("never touches a video that already has a session", async () => {
  db.session.findFirst.mockResolvedValue({ sessionId: 33 } as never);

  await expect(write()).resolves.toEqual({ status: "exists", sessionId: 33 });
  expect(db.session.create).not.toHaveBeenCalled();
});

test("writes nothing for an empty draft", async () => {
  await expect(write({ sets: [], skipped: [], warnings: [] })).resolves.toEqual({
    status: "empty",
  });
  expect(db.session.findFirst).not.toHaveBeenCalled();
});
