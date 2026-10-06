import { vi, type Mock } from "vitest";

interface MockPrismaClient {
  game: { findFirst: Mock };
  session: { findFirst: Mock; create: Mock };
  gameSet: { create: Mock; update: Mock };
  match: { create: Mock };
  playerSession: { create: Mock };
  playerStat: { create: Mock; createMany: Mock };
  gameStat: { findMany: Mock };
  player: { findUnique: Mock };
  $transaction: Mock;
}

vi.mock("prisma/db", () => {
  const mockPrisma: MockPrismaClient = {
    game: { findFirst: vi.fn() },
    session: { findFirst: vi.fn(), create: vi.fn() },
    gameSet: { create: vi.fn(), update: vi.fn() },
    match: { create: vi.fn() },
    playerSession: { create: vi.fn() },
    playerStat: { create: vi.fn(), createMany: vi.fn() },
    gameStat: { findMany: vi.fn() },
    player: { findUnique: vi.fn() },
    $transaction: vi.fn(
      (callback: (tx: MockPrismaClient) => Promise<unknown>) =>
        callback(mockPrisma),
    ),
  };
  return {
    __esModule: true,
    default: mockPrisma,
    handlePrismaOperation: vi.fn(
      (callback: (prisma: MockPrismaClient) => Promise<unknown>) =>
        callback(mockPrisma)
          .then((data) => ({ success: true, data }))
          .catch((error: Error) => ({ success: false, error: error.message })),
    ),
  };
});

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

import { insertNewSessionFromAdmin } from "../actions/adminAction";
import { auth } from "@/lib/auth";
import prisma from "prisma/db";
import { errorCodes } from "@/lib/constants";
import { FormValues } from "../(routes)/admin/_utils/form-helpers";
import { StatName } from "@/lib/stat-names";

const mockGetSession = auth.api.getSession as unknown as Mock;

const validSession = (): FormValues => ({
  game: "Call of Duty",
  sessionName: "Session Name",
  sessionUrl: "https://www.youtube.com/watch?v=video123",
  thumbnail: "https://example.com/thumbnail.jpg",
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
                { statId: "1", stat: StatName.COD_SCORE, statValue: "100" },
                { statId: "2", stat: StatName.COD_POS, statValue: "1" },
              ],
              playerSessionName: "Ben",
            },
          ],
        },
      ],
    },
  ],
});

describe("adminAction tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("insertNewSessionFromAdmin", () => {
    it("should insert a new session successfully", async () => {
      mockGetSession.mockResolvedValue({
        user: { role: "admin", email: "test@test.com" },
      });
      (prisma.game.findFirst as Mock).mockResolvedValue({ gameId: 1 });
      (prisma.session.findFirst as Mock).mockResolvedValue(null);
      (prisma.session.create as Mock).mockResolvedValue({ sessionId: 1 });
      (prisma.gameSet.create as Mock).mockResolvedValue({ setId: 1 });
      (prisma.gameSet.update as Mock).mockResolvedValue({});
      (prisma.match.create as Mock).mockResolvedValue({ matchId: 1 });
      (prisma.playerSession.create as Mock).mockResolvedValue({
        playerSessionId: 1,
        playerId: 1,
      });
      (prisma.playerStat.createMany as Mock).mockResolvedValue({});
      (prisma.gameStat.findMany as Mock).mockResolvedValue([
        { statId: 1, statName: "COD_SCORE" },
        { statId: 2, statName: "COD_POS" },
      ]);
      (prisma.player.findUnique as Mock).mockResolvedValue({
        playerId: 1,
        playerName: "Ben",
      });

      const session = validSession();

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
      (prisma.game.findFirst as Mock).mockResolvedValue(null);

      const result = await insertNewSessionFromAdmin(validSession());
      expect(result).toEqual({ error: "Game not found." });
    });

    it("should return an error if video already exists", async () => {
      mockGetSession.mockResolvedValue({ user: { role: "admin" } });
      (prisma.game.findFirst as Mock).mockResolvedValue({ gameId: 1 });
      (prisma.session.findFirst as Mock).mockResolvedValue({});

      const result = await insertNewSessionFromAdmin(validSession());
      expect(result).toEqual({ error: "Video already exists." });
    });

    it("should return a generic error if an exception is thrown", async () => {
      mockGetSession.mockResolvedValue({ user: { role: "admin" } });
      (prisma.game.findFirst as Mock).mockImplementation(() => {
        throw new Error("Unexpected error");
      });

      const result = await insertNewSessionFromAdmin(validSession());
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
