// All mocks must be defined inline because jest.mock is hoisted
// Define mock prisma types to avoid self-referential type issues
interface MockPrismaClient {
  game: { findFirst: jest.Mock };
  session: { findFirst: jest.Mock; create: jest.Mock };
  gameSet: { create: jest.Mock; update: jest.Mock };
  match: { create: jest.Mock };
  playerSession: { create: jest.Mock };
  playerStat: { create: jest.Mock; createMany: jest.Mock };
  gameStat: { findMany: jest.Mock };
  player: { findUnique: jest.Mock };
  $transaction: jest.Mock;
}

jest.mock("prisma/db", () => {
  const mockPrisma: MockPrismaClient = {
    game: { findFirst: jest.fn() },
    session: { findFirst: jest.fn(), create: jest.fn() },
    gameSet: { create: jest.fn(), update: jest.fn() },
    match: { create: jest.fn() },
    playerSession: { create: jest.fn() },
    playerStat: { create: jest.fn(), createMany: jest.fn() },
    gameStat: { findMany: jest.fn() },
    player: { findUnique: jest.fn() },
    $transaction: jest.fn(
      (callback: (tx: MockPrismaClient) => Promise<unknown>) =>
        callback(mockPrisma),
    ),
  };
  return {
    __esModule: true,
    default: mockPrisma,
    handlePrismaOperation: jest.fn(
      (callback: (prisma: MockPrismaClient) => Promise<unknown>) =>
        callback(mockPrisma)
          .then((data) => ({ success: true, data }))
          .catch((error: Error) => ({ success: false, error: error.message })),
    ),
  };
});

jest.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));
jest.mock("@/posthog/server-analytics", () => ({
  logAdminAction: jest.fn(),
  logFormError: jest.fn(),
  logFormSuccess: jest.fn(),
}));
jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));
jest.mock("next/server", () => ({
  after: jest.fn((fn: () => void) => fn()),
}));
jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

import { insertNewSessionFromAdmin } from "../actions/adminAction";
import { auth } from "@/lib/auth";
import prisma from "prisma/db";
import { errorCodes } from "@/lib/constants";

const mockGetSession = auth.api.getSession as unknown as jest.Mock;

describe("adminAction tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("insertNewSessionFromAdmin", () => {
    it("should insert a new session successfully", async () => {
      mockGetSession.mockResolvedValue({
        user: { role: "admin", email: "test@test.com" },
      });
      (prisma.game.findFirst as jest.Mock).mockResolvedValue({ gameId: 1 });
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.session.create as jest.Mock).mockResolvedValue({ sessionId: 1 });
      (prisma.gameSet.create as jest.Mock).mockResolvedValue({ setId: 1 });
      (prisma.gameSet.update as jest.Mock).mockResolvedValue({});
      (prisma.match.create as jest.Mock).mockResolvedValue({ matchId: 1 });
      (prisma.playerSession.create as jest.Mock).mockResolvedValue({
        playerSessionId: 1,
        playerId: 1,
      });
      (prisma.playerStat.createMany as jest.Mock).mockResolvedValue({});
      (prisma.gameStat.findMany as jest.Mock).mockResolvedValue([
        { statId: 1, statName: "COD_SCORE" },
      ]);
      (prisma.player.findUnique as jest.Mock).mockResolvedValue({
        playerId: 1,
        playerName: "Ben",
      });

      const session: Parameters<typeof insertNewSessionFromAdmin>["0"] = {
        game: "Call of Duty",
        sessionName: "Session Name",
        sessionUrl: "http://example.com",
        thumbnail: "http://example.com/thumbnail.jpg",
        date: new Date("2023-10-01"),
        videoId: "video123",
        players: [{ playerId: 1, playerName: "Ben" }],
        sets: [
          {
            setId: 1,
            setWinners: [{ playerId: 1, playerName: "Ben" }],
            matches: [
              {
                matchWinners: [{ playerId: 1, playerName: "Ben" }],
                playerSessions: [
                  {
                    playerId: 1,
                    playerStats: [
                      { statId: "1", stat: "COD_SCORE", statValue: "100" },
                    ],
                    playerSessionName: "",
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await insertNewSessionFromAdmin(session);
      expect(result).toEqual({ error: null });
    });

    it("should return an error if not authenticated", async () => {
      mockGetSession.mockResolvedValue(null);

      const session: Parameters<typeof insertNewSessionFromAdmin>["0"] = {
        game: "Call of Duty",
        sessionName: "Session Name",
        sessionUrl: "http://example.com",
        thumbnail: "http://example.com/thumbnail.jpg",
        date: new Date("2023-10-01"),
        videoId: "video123",
        sets: [],
        players: [{ playerId: 1, playerName: "Ben" }],
      };

      const result = await insertNewSessionFromAdmin(session);
      expect(result).toEqual({ error: errorCodes.NotAuthenticated });
    });

    it("should return an error if game not found", async () => {
      mockGetSession.mockResolvedValue({ user: { role: "admin" } });
      (prisma.game.findFirst as jest.Mock).mockResolvedValue(null);

      const session: Parameters<typeof insertNewSessionFromAdmin>["0"] = {
        game: "Call of Duty",
        sessionName: "Session Name",
        sessionUrl: "http://example.com",
        thumbnail: "http://example.com/thumbnail.jpg",
        date: new Date("2023-10-01"),
        videoId: "video123",
        sets: [],
        players: [{ playerId: 1, playerName: "Ben" }],
      };

      const result = await insertNewSessionFromAdmin(session);
      expect(result).toEqual({ error: "Game not found." });
    });

    it("should return an error if video already exists", async () => {
      mockGetSession.mockResolvedValue({ user: { role: "admin" } });
      (prisma.game.findFirst as jest.Mock).mockResolvedValue({ gameId: 1 });
      (prisma.session.findFirst as jest.Mock).mockResolvedValue({});

      const session: Parameters<typeof insertNewSessionFromAdmin>["0"] = {
        game: "Call of Duty",
        sessionName: "Session Name",
        sessionUrl: "http://example.com",
        thumbnail: "http://example.com/thumbnail.jpg",
        date: new Date("2023-10-01"),
        videoId: "video123",
        sets: [],
        players: [{ playerId: 1, playerName: "Ben" }],
      };

      const result = await insertNewSessionFromAdmin(session);
      expect(result).toEqual({ error: "Video already exists." });
    });

    it("should return a generic error if an exception is thrown", async () => {
      mockGetSession.mockResolvedValue({ user: { role: "admin" } });
      (prisma.game.findFirst as jest.Mock).mockImplementation(() => {
        throw new Error("Unexpected error");
      });

      const session: Parameters<typeof insertNewSessionFromAdmin>["0"] = {
        game: "Call of Duty",
        sessionName: "Session Name",
        sessionUrl: "http://example.com",
        thumbnail: "http://example.com/thumbnail.jpg",
        date: new Date("2023-10-01"),
        videoId: "video123",
        sets: [],
        players: [{ playerId: 1, playerName: "Ben" }],
      };

      const result = await insertNewSessionFromAdmin(session);
      expect(result).toEqual({
        error: "Unknown error occurred. Please try again.",
      });
    });
  });

  // describe("insertNewSessionV2", () => {
  //   it("should insert a new session successfully", async () => {
  //     (auth as jest.Mock).mockResolvedValue(true);
  //     (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);
  //     (prisma.session.create as jest.Mock).mockResolvedValue({ sessionId: 1 });
  //     (prisma.gameSet.update as jest.Mock).mockResolvedValue({});
  //     (prisma.playerSession.update as jest.Mock).mockResolvedValue({});
  //     (prisma.playerStat.update as jest.Mock).mockResolvedValue({});
  //     (prisma.$transaction as jest.Mock).mockImplementation((callback) =>
  //       callback(prisma),
  //     );

  //     const session: Parameters<typeof insertNewSessionFromAdmin>["0"] = {
  //       game: "Game Name",
  //       sessionName: "Session Name",
  //       sessionUrl: "http://example.com",
  //       thumbnail: "http://example.com/thumbnail.jpg",
  //       date: new Date("2023-10-01"),
  //       videoId: "video123",
  //       players: [{ playerId: 1, playerName: "Player 1" }],
  //       sets: [
  //         {
  //           setId: 1,
  //           setWinners: [{ playerId: 1, playerName: "Player 1" }],
  //           matches: [
  //             {
  //               matchWinners: [{ playerId: 1, playerName: "Player 1" }],
  //               playerSessions: [
  //                 {
  //                   playerSessionName: "",
  //                   playerId: 1,
  //                   playerStats: [
  //                     { statId: "1", stat: "Score", statValue: "100" },
  //                   ],
  //                 },
  //               ],
  //             },
  //           ],
  //         },
  //       ],
  //     };

  //     const result = await insertNewSessionV2(session);
  //     expect(result).toEqual({ error: null });
  //   });

  //   it("should return an error if not authenticated", async () => {
  //     (auth as jest.Mock).mockResolvedValue(false);

  //     const session: Parameters<typeof insertNewSessionFromAdmin>["0"] = {
  //       game: "Game Name",
  //       sessionName: "Session Name",
  //       sessionUrl: "http://example.com",
  //       thumbnail: "http://example.com/thumbnail.jpg",
  //       date: new Date("2023-10-01"),
  //       videoId: "video123",
  //       sets: [],
  //       players: [{ playerId: 1, playerName: "Player 1" }],
  //     };

  //     const result = await insertNewSessionV2(session);
  //     expect(result).toEqual({ error: errorCodes.NotAuthenticated });
  //   });

  //   it("should return an error if game not found", async () => {
  //     (auth as jest.Mock).mockResolvedValue(true);
  //     (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);

  //     const session: Parameters<typeof insertNewSessionFromAdmin>["0"] = {
  //       game: "Nonexistent Game",
  //       sessionName: "Session Name",
  //       sessionUrl: "http://example.com",
  //       thumbnail: "http://example.com/thumbnail.jpg",
  //       date: new Date("2023-10-01"),
  //       videoId: "video123",
  //       sets: [],
  //       players: [{ playerId: 1, playerName: "Player 1" }],
  //     };

  //     const result = await insertNewSessionV2(session);
  //     expect(result).toEqual({ error: "Game not found." });
  //   });

  //   it("should return an error if video already exists", async () => {
  //     (auth as jest.Mock).mockResolvedValue(true);
  //     (prisma.session.findFirst as jest.Mock).mockResolvedValue({});

  //     const session: Parameters<typeof insertNewSessionFromAdmin>["0"] = {
  //       game: "Game Name",
  //       sessionName: "Session Name",
  //       sessionUrl: "http://example.com",
  //       thumbnail: "http://example.com/thumbnail.jpg",
  //       date: new Date("2023-10-01"),
  //       videoId: "video123",
  //       sets: [],
  //       players: [{ playerId: 1, playerName: "Player 1" }],
  //     };

  //     const result = await insertNewSessionV2(session);
  //     expect(result).toEqual({ error: "Video already exists." });
  //   });
  // });
});
