/**
 * Vision Action Tests
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

vi.mock("@/lib/config", () => ({
  __esModule: true,
  default: {
    DOCUMENT_INTELLIGENCE_ENDPOINT: "https://example.test",
    DOCUMENT_INTELLIGENCE_API_KEY: "test-key",
  },
}));

// Store mock functions in a mutable object that can be accessed after hoisting
const azureMocks = vi.hoisted(() => ({
  post: vi.fn(),
  pollUntilDone: vi.fn(),
}));

// Mock Azure SDK
vi.mock("@azure-rest/ai-document-intelligence", () => {
  // Use a closure to capture the mocks object reference
  return {
    __esModule: true,
    default: vi.fn(() => ({
      path: vi.fn(() => ({
        post: (...args: unknown[]) => azureMocks.post(...args),
      })),
    })),
    getLongRunningPoller: vi.fn(() => ({
      get body() {
        return azureMocks.pollUntilDone().then((res: { body: unknown }) => res.body);
      },
      pollUntilDone: (...args: unknown[]) => azureMocks.pollUntilDone(...args),
    })),
    isUnexpected: vi.fn(() => false),
  };
});

import { analyzeScreenShot, getGameProcessor } from "../actions/visionAction";
import { VisionResultCodes } from "@/lib/constants";
import { MarioKart8Processor } from "@/lib/game-processors/MarioKart8Processor";
import { RocketLeagueProcessor } from "@/lib/game-processors/RocketLeagueProcessor";
import { CoDGunGameProcessor } from "@/lib/game-processors/CoDGunGameProcessor";
import { Player } from "@/generated/prisma/client";

const mockMK8Processor = vi.mocked(MarioKart8Processor);

// Expose mock functions for test usage
const mockPostFn = azureMocks.post;
const mockPollUntilDoneFn = azureMocks.pollUntilDone;

describe("Vision Action Tests", () => {
  const mockBase64 = "mockBase64String";
  const mockPlayers = [{ playerId: 1, playerName: "Player1" }] as Player[];

  beforeEach(() => {
    vi.clearAllMocks();
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
