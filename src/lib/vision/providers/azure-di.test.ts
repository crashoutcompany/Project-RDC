/**
 * Azure Document Intelligence vision provider tests.
 *
 * Covers the Azure-specific mechanics (the analyze call, the long-running
 * poller, and the raw field shape) that used to live inline in
 * `visionAction.ts` before the provider abstraction.
 */
import { vi } from "vitest";

vi.mock("@/lib/config", () => ({
  __esModule: true,
  default: {
    DOCUMENT_INTELLIGENCE_ENDPOINT: "https://example.test",
    DOCUMENT_INTELLIGENCE_API_KEY: "test-key",
  },
}));

const azureMocks = vi.hoisted(() => ({
  post: vi.fn(),
  pollUntilDone: vi.fn(),
}));

vi.mock("@azure-rest/ai-document-intelligence", () => ({
  __esModule: true,
  default: vi.fn(() => ({
    path: vi.fn(() => ({
      post: (...args: unknown[]) => azureMocks.post(...args),
    })),
  })),
  getLongRunningPoller: vi.fn(() => ({
    get body() {
      return azureMocks
        .pollUntilDone()
        .then((res: { body: unknown }) => res.body);
    },
  })),
  isUnexpected: vi.fn(() => false),
}));

import { azureDocumentIntelligenceProvider } from "./azure-di";

const mockPostFn = azureMocks.post;
const mockPollUntilDoneFn = azureMocks.pollUntilDone;

describe("azureDocumentIntelligenceProvider", () => {
  const mockInput = {
    imageBase64: "mockBase64String",
    gameId: 1,
    rosterHint: [] as string[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPostFn.mockResolvedValue({});
    mockPollUntilDoneFn.mockResolvedValue({
      body: {
        analyzeResult: {
          documents: [
            {
              fields: {
                Players: {
                  type: "array",
                  valueArray: [
                    {
                      type: "object",
                      valueObject: {
                        PlayerName: { type: "string", content: "Player1", confidence: 0.99 },
                        mk8_place: { type: "string", content: "1", confidence: 0.95 },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    });
  });

  it("has a stable id", () => {
    expect(azureDocumentIntelligenceProvider.id).toBe("azure-di");
  });

  it("propagates a rejected analyze call", async () => {
    mockPostFn.mockRejectedValueOnce(new Error("API Error"));
    await expect(
      azureDocumentIntelligenceProvider.extract(mockInput),
    ).rejects.toThrow("API Error");
  });

  it("propagates a rejected poller", async () => {
    mockPollUntilDoneFn.mockRejectedValueOnce(new Error("Poller Error"));
    await expect(
      azureDocumentIntelligenceProvider.extract(mockInput),
    ).rejects.toThrow("Poller Error");
  });

  it("throws when analyzeResult/documents are missing", async () => {
    mockPollUntilDoneFn.mockResolvedValueOnce({ body: {} });
    await expect(
      azureDocumentIntelligenceProvider.extract(mockInput),
    ).rejects.toThrow("Vision analysis returned no document fields");
  });

  it("throws when document fields are undefined", async () => {
    mockPollUntilDoneFn.mockResolvedValueOnce({
      body: { analyzeResult: { documents: [{ fields: undefined }] } },
    });
    await expect(
      azureDocumentIntelligenceProvider.extract(mockInput),
    ).rejects.toThrow("Vision analysis returned no document fields");
  });

  it("normalizes a SOLO game's single array field into `players`", async () => {
    const result = await azureDocumentIntelligenceProvider.extract(mockInput);
    expect(result).toEqual({
      players: [
        { name: "Player1", stats: { mk8_place: "1" }, confidence: 0.95 },
      ],
    });
  });

  it("normalizes a TEAM game's fields into `teams`, mapping legacy field names to team keys", async () => {
    mockPollUntilDoneFn.mockResolvedValueOnce({
      body: {
        analyzeResult: {
          documents: [
            {
              fields: {
                BluePlayers: {
                  type: "array",
                  valueArray: [
                    {
                      type: "object",
                      valueObject: {
                        PlayerName: { type: "string", content: "Player1", confidence: 1 },
                        rl_goals: { type: "string", content: "3", confidence: 1 },
                      },
                    },
                  ],
                },
                OrangePlayers: {
                  type: "array",
                  valueArray: [
                    {
                      type: "object",
                      valueObject: {
                        PlayerName: { type: "string", content: "Player2", confidence: 1 },
                        rl_goals: { type: "string", content: "1", confidence: 1 },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    });

    const result = await azureDocumentIntelligenceProvider.extract({
      ...mockInput,
      gameId: 2,
    });

    expect(result).toEqual({
      teams: [
        {
          teamKey: "blue",
          players: [{ name: "Player1", stats: { rl_goals: "3" }, confidence: 1 }],
        },
        {
          teamKey: "orange",
          players: [{ name: "Player2", stats: { rl_goals: "1" }, confidence: 1 }],
        },
      ],
    });
  });
});
