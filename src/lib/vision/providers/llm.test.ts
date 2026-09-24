import { vi } from "vitest";

const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: generateTextMock };
});

// Avoid a real network flush attempt from the AI SDK's PostHog span processor.
vi.mock("@/posthog/ai-telemetry", () => ({
  flushAiTelemetry: vi.fn(),
  AI_TELEMETRY_INCLUDE_RUNTIME_CONTEXT: {},
  AiTelemetryProperty: { SOURCE: "source", ENVIRONMENT: "environment" },
}));

import { createLlmVisionProvider } from "./llm";

describe("createLlmVisionProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends an image part and reshapes flat player rows into ExtractedScoreboard", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        players: [{ name: "Mark", rl_goals: 3, rl_assists: undefined }],
      },
    });

    const provider = createLlmVisionProvider("google:gemini-2.5-flash");
    expect(provider.id).toBe("llm:google:gemini-2.5-flash");

    const result = await provider.extract({
      imageBase64: "iVBORw0KGgoAAAANSUhEUg==",
      gameId: 2,
      rosterHint: ["Mark"],
    });

    expect(result).toEqual({
      teams: undefined,
      players: [{ name: "Mark", stats: { rl_goals: 3 } }],
    });

    const call = generateTextMock.mock.calls[0][0];
    const imagePart = call.messages[0].content.find(
      (part: { type: string }) => part.type === "image",
    );
    expect(imagePart).toMatchObject({
      type: "image",
      mediaType: "image/png",
    });
  });

  it("uses the jpeg media type for jpeg-magic-byte input", async () => {
    generateTextMock.mockResolvedValue({ output: { players: [] } });
    const provider = createLlmVisionProvider("google:gemini-2.5-flash");

    await provider.extract({
      imageBase64: "/9j/4AAQSkZJRg==",
      gameId: 1,
      rosterHint: [],
    });

    const call = generateTextMock.mock.calls[0][0];
    const imagePart = call.messages[0].content.find(
      (part: { type: string }) => part.type === "image",
    );
    expect(imagePart).toMatchObject({ mediaType: "image/jpeg" });
  });

  it("throws when the model returns no output", async () => {
    generateTextMock.mockResolvedValue({ output: undefined });
    const provider = createLlmVisionProvider("google:gemini-2.5-flash");

    await expect(
      provider.extract({
        imageBase64: "iVBORw0KGgo",
        gameId: 2,
        rosterHint: [],
      }),
    ).rejects.toThrow("Vision extraction produced no result");
  });
});
