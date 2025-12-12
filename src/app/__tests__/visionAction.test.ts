import { analyzeScreenShot, getGameProcessor } from "../actions/visionAction";
import { VisionResultCodes } from "@/lib/constants";
import { MarioKart8Processor } from "@/lib/game-processors/MarioKart8Processor";
import { RocketLeagueProcessor } from "@/lib/game-processors/RocketLeagueProcessor";
import { CoDGunGameProcessor } from "@/lib/game-processors/CoDGunGameProcessor";
import { Player } from "@/generated/prisma/client";

// Mock the game processor modules
jest.mock("@/lib/game-processors/MarioKart8Processor");
jest.mock("@/lib/game-processors/RocketLeagueProcessor");
jest.mock("@/lib/game-processors/CoDGunGameProcessor");

const mockMK8Processor = MarioKart8Processor as jest.Mocked<
  typeof MarioKart8Processor
>;

// Mock Azure SDK
const mockPost = jest.fn();
const mockPollUntilDone = jest.fn();
jest.mock("@azure-rest/ai-document-intelligence", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    path: jest.fn(() => ({ post: mockPost })),
  })),
  getLongRunningPoller: jest.fn(() => ({ pollUntilDone: mockPollUntilDone })),
  isUnexpected: jest.fn(() => false),
}));

describe("Vision Action Tests", () => {
  const mockBase64 = "mockBase64String";
  const mockPlayers = [{ playerId: 1, playerName: "Player1" }] as Player[];

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations for a successful path
    mockPost.mockResolvedValue({});
    mockPollUntilDone.mockResolvedValue({
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
      mockPost.mockRejectedValueOnce(new Error("API Error"));
      const result = await analyzeScreenShot(mockBase64, mockPlayers, 1);
      expect(result).toEqual({
        status: VisionResultCodes.Failed,
        message: "API Error",
      });
    });

    it("handles poller errors gracefully", async () => {
      mockPollUntilDone.mockRejectedValueOnce(new Error("Poller Error"));
      const result = await analyzeScreenShot(mockBase64, mockPlayers, 1);
      expect(result).toEqual({
        status: VisionResultCodes.Failed,
        message: "Poller Error",
      });
    });

    it("handles missing analyze result", async () => {
      mockPollUntilDone.mockResolvedValueOnce({ body: {} });
      const result = await analyzeScreenShot(mockBase64, mockPlayers, 1);
      expect(result).toEqual({
        status: VisionResultCodes.Failed,
        message: "Analyze result or documents are undefined",
      });
    });

    it("handles undefined vision analysis results", async () => {
      mockPollUntilDone.mockResolvedValueOnce({
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
