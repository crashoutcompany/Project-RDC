/**
 * Vision Action Tests
 *
 * Azure Document Intelligence-specific mechanics (the analyze call, the
 * poller, raw field shapes) now live in `src/lib/vision/providers/azure-di.ts`
 * and are covered by `azure-di.test.ts`. This file only exercises
 * `analyzeScreenShot`'s own orchestration, against a mocked provider.
 */
import { vi } from "vitest";

// Mock modules that import ESM packages
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock the game processor modules
vi.mock("@/lib/game-processors/MarioKart8Processor");
vi.mock("@/lib/game-processors/RocketLeagueProcessor");
vi.mock("@/lib/game-processors/CoDGunGameProcessor");

const visionMocks = vi.hoisted(() => ({
  extract: vi.fn(),
}));

vi.mock("@/lib/vision", () => ({
  getVisionProvider: vi.fn(() => ({
    id: "test-provider",
    extract: visionMocks.extract,
  })),
  toLegacyAnalyzed: vi.fn(() => []),
  buildRosterHint: vi.fn(() => []),
}));

import { analyzeScreenShot, getGameProcessor } from "../actions/visionAction";
import { VisionResultCodes } from "@/lib/constants";
import { MarioKart8Processor } from "@/lib/game-processors/MarioKart8Processor";
import { RocketLeagueProcessor } from "@/lib/game-processors/RocketLeagueProcessor";
import { CoDGunGameProcessor } from "@/lib/game-processors/CoDGunGameProcessor";
import { Player } from "@/generated/prisma/client";

const mockMK8Processor = vi.mocked(MarioKart8Processor);
const mockExtract = visionMocks.extract;

describe("Vision Action Tests", () => {
  const mockBase64 = "mockBase64String";
  const mockPlayers = [{ playerId: 1, playerName: "Player1" }] as Player[];

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation for a successful path
    mockExtract.mockResolvedValue({
      players: [{ name: "Player1", stats: {} }],
    });
  });

  describe("getGameProcessor", () => {
    it("returns correct processors", () => {
      expect(getGameProcessor(1)).toBe(MarioKart8Processor);
      expect(getGameProcessor(2)).toBe(RocketLeagueProcessor);
      expect(getGameProcessor(3)).toBe(CoDGunGameProcessor);
    });

    it("throws error for invalid game id", () => {
      expect(() => getGameProcessor(999)).toThrow("Invalid game id: 999");
    });
  });

  describe("analyzeScreenShot", () => {
    it("handles invalid game id", async () => {
      const result = await analyzeScreenShot(mockBase64, mockPlayers, 999);
      expect(result).toEqual({
        status: VisionResultCodes.Failed,
        message: "Invalid game id: 999",
      });
    });

    it("handles provider extraction errors gracefully", async () => {
      mockExtract.mockRejectedValueOnce(new Error("Provider Error"));
      const result = await analyzeScreenShot(mockBase64, mockPlayers, 1);
      expect(result).toEqual({
        status: VisionResultCodes.Failed,
        message: "Provider Error",
      });
    });

    it("successfully processes a game screenshot", async () => {
      const mockProcessedData = {
        processedPlayers: [{ name: "Dylan" as const, stats: [] }],
        reqCheckFlag: false,
      };
      mockMK8Processor.processPlayers.mockReturnValue(mockProcessedData);
      mockMK8Processor.validateStats.mockImplementation((val) => ({
        statValue: val || "0",
        reqCheck: false,
      }));
      mockMK8Processor.calculateWinners.mockReturnValue([]);
      mockMK8Processor.validateResults.mockReturnValue({
        status: VisionResultCodes.Success,
        data: { players: mockProcessedData.processedPlayers, winner: [] },
        message: "Success",
      });

      const result = await analyzeScreenShot(mockBase64, mockPlayers, 1);
      expect(result.status).toBe(VisionResultCodes.Success);
    });

    it("flags CheckRequest when a stat requires manual review", async () => {
      const mockProcessedData = {
        processedPlayers: [
          { name: "Dylan" as const, stats: [{ statId: 1, stat: "MK8_POS", statValue: "Z" }] },
        ],
        reqCheckFlag: false,
      };
      mockMK8Processor.processPlayers.mockReturnValue(mockProcessedData);
      mockMK8Processor.validateStats.mockReturnValue({
        statValue: "0",
        reqCheck: true,
      });
      mockMK8Processor.calculateWinners.mockReturnValue([]);
      mockMK8Processor.validateResults.mockImplementation(
        (players, winners, requiresCheck) => ({
          status: requiresCheck
            ? VisionResultCodes.CheckRequest
            : VisionResultCodes.Success,
          data: { players, winner: winners },
          message: "",
        }),
      );

      const result = await analyzeScreenShot(mockBase64, mockPlayers, 1);
      expect(result.status).toBe(VisionResultCodes.CheckRequest);
    });
  });
});
