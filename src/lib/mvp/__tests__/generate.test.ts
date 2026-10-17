import { vi } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn(() => ({})) },
}));
vi.mock("@ai-sdk/google", () => ({ google: vi.fn(() => "gemini-model") }));
vi.mock("@/posthog/ai-telemetry", () => ({
  AI_TELEMETRY_INCLUDE_RUNTIME_CONTEXT: false,
  AiTelemetryProperty: { ENVIRONMENT: "environment", SESSION_ID: "sessionId" },
  flushAiTelemetry: vi.fn(async () => {}),
}));

import { generateText } from "ai";
import prisma from "prisma/db";
import { revalidateTag } from "next/cache";
import { generateMvpForSession } from "../generate";

const db = vi.mocked(prisma, { deep: true });
const gemini = vi.mocked(generateText);

const sets = [{ setWinners: ["Ben"], matches: [] }];
const output = { player: "Ben", description: "Carried", stats: [] };

describe("generateMvpForSession", () => {
  it("returns the stored MVP without calling Gemini", async () => {
    db.session.findFirst.mockResolvedValue({
      mvpDescription: "Already decided",
      mvpStats: [],
      mvp: { playerName: "Ben" },
    } as never);

    expect(await generateMvpForSession(7, { sets })).toEqual({
      description: "Already decided",
      stats: [],
      player: "Ben",
    });
    expect(gemini).not.toHaveBeenCalled();
  });

  it("writes the MVP only while the session has none, then revalidates", async () => {
    db.session.findFirst.mockResolvedValue(null);
    db.player.findFirst.mockResolvedValue({ playerId: 4 } as never);
    db.session.updateMany.mockResolvedValue({ count: 1 } as never);
    gemini.mockResolvedValue({ output, usage: {} } as never);

    expect(await generateMvpForSession(7, { sets })).toEqual(output);

    expect(gemini).toHaveBeenCalledTimes(1);
    expect(db.session.updateMany).toHaveBeenCalledWith({
      where: { sessionId: 7, mvpId: null },
      data: { mvpDescription: "Carried", mvpStats: [], mvpId: 4 },
    });
    expect(revalidateTag).toHaveBeenCalledWith("getAllSessions", "max");
  });

  it("returns the winning MVP when another run stored one first", async () => {
    db.session.findFirst.mockResolvedValue(null);
    db.session.updateMany.mockResolvedValue({ count: 0 } as never);
    db.session.findFirstOrThrow.mockResolvedValue({
      mvpDescription: "Someone else",
      mvpStats: [],
      mvp: { playerName: "Ana" },
    } as never);
    gemini.mockResolvedValue({ output, usage: {} } as never);

    expect(await generateMvpForSession(7, { sets })).toEqual({
      description: "Someone else",
      stats: [],
      player: "Ana",
    });
  });
});
