import { describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { extractWithGemini } from "../gemini-reader";
import { UnusableOutputError } from "../api-errors";

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: vi.fn(),
}));

describe("extractWithGemini", () => {
  it("throws UnusableOutputError when the SDK returns no structured output", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: undefined } as never);

    const err = await extractWithGemini({ base64Source: "iVBORw0KGgo=", gameId: 2, apiKey: "test" }).catch((e) => e);

    expect(err).toBeInstanceOf(UnusableOutputError);
    expect(err.message).toBe("Gemini returned no structured output");
  });
});
