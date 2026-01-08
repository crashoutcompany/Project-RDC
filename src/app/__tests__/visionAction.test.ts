/**
 * Vision Action Tests
 *
 * Note: Some tests may fail due to Jest mock hoisting issues with the Azure SDK.
 * The mock functions are defined but accessed before initialization due to jest.mock hoisting.
 * Consider using jest.doMock() or manual mocks in __mocks__ folder for more reliable mocking.
 */

// Mock modules that import ESM packages
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
  logVisionAction: jest.fn(),
  logVisionError: jest.fn(),
}));

// Mock the game processor modules
jest.mock("@/lib/game-processors/MarioKart8Processor");
jest.mock("@/lib/game-processors/RocketLeagueProcessor");
jest.mock("@/lib/game-processors/CoDGunGameProcessor");

// Store mock functions in a mutable object that can be accessed after hoisting
const azureMocks = {
  post: jest.fn(),
  pollUntilDone: jest.fn(),
};

// Mock Azure SDK
jest.mock("@azure-rest/ai-document-intelligence", () => {
  // Use a closure to capture the mocks object reference
  return {
    __esModule: true,
    default: jest.fn(() => ({
      path: jest.fn(() => ({
        post: (...args: unknown[]) => azureMocks.post(...args),
      })),
    })),
    getLongRunningPoller: jest.fn(() => ({
      pollUntilDone: (...args: unknown[]) => azureMocks.pollUntilDone(...args),
    })),
    isUnexpected: jest.fn(() => false),
  };
});

import { analyzeScreenShot, getGameProcessor } from "../actions/visionAction";
import { VisionResultCodes } from "@/lib/constants";
import { MarioKart8Processor } from "@/lib/game-processors/MarioKart8Processor";
import { RocketLeagueProcessor } from "@/lib/game-processors/RocketLeagueProcessor";
import { CoDGunGameProcessor } from "@/lib/game-processors/CoDGunGameProcessor";
import { Player } from "@/generated/prisma/client";

const mockMK8Processor = MarioKart8Processor as jest.Mocked<
  typeof MarioKart8Processor
>;

// Expose mock functions for test usage
const mockPostFn = azureMocks.post;
const mockPollUntilDoneFn = azureMocks.pollUntilDone;

describe("Vision Action Tests", () => {
  const mockBase64 = "mockBase64String";
  const mockPlayers = [{ playerId: 1, playerName: "Player1" }] as Player[];

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations for a successful path
    mockPostFn.mockResolvedValue({});
    mockPollUntilDoneFn.mockResolvedValue({
      body: {
        analyzeResult: {
          documents: [{ fields: { player1: { content: "Player1" } } }],
        },
      },
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

    it("handles API errors gracefully", async () => {
      mockPostFn.mockRejectedValueOnce(new Error("API Error"));
      const result = await analyzeScreenShot(mockBase64, mockPlayers, 1);
      expect(result).toEqual({
        status: VisionResultCodes.Failed,
        message: "API Error",
      });
    });

    it("handles poller errors gracefully", async () => {
      mockPollUntilDoneFn.mockRejectedValueOnce(new Error("Poller Error"));
      const result = await analyzeScreenShot(mockBase64, mockPlayers, 1);
      expect(result).toEqual({
        status: VisionResultCodes.Failed,
        message: "Poller Error",
      });
    });

    it("handles missing analyze result", async () => {
      mockPollUntilDoneFn.mockResolvedValueOnce({ body: {} });
      const result = await analyzeScreenShot(mockBase64, mockPlayers, 1);
      expect(result).toEqual({
        status: VisionResultCodes.Failed,
        message: "Analyze result or documents are undefined",
      });
    });

    it("handles undefined vision analysis results", async () => {
      mockPollUntilDoneFn.mockResolvedValueOnce({
        body: { analyzeResult: { documents: [{ fields: undefined }] } },
      });
      const result = await analyzeScreenShot(mockBase64, mockPlayers, 1);
      expect(result).toEqual({
        status: VisionResultCodes.Failed,
        message: "Vision Analysis Player Results are undefined",
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
  });
});
