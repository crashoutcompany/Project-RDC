import { describe, expect, it, vi } from "vitest";
import type { Player } from "@/generated/prisma/client";
import { VisionResultCodes } from "@/lib/constants";
import type { ExtractedScoreboard } from "../types";

const providers = vi.hoisted(() => ({
  extract: vi.fn(),
  create: vi.fn(),
}));
// A plain function, not a vi.fn implementation: the global afterEach's
// restoreAllMocks() would wipe the latter between tests.
vi.mock("../providers/llm", () => ({
  createLlmVisionProvider: (...args: unknown[]) => {
    providers.create(...args);
    return { id: "llm:test", extract: providers.extract };
  },
}));

import {
  createReaders,
  llmReader,
  primaryReaderFromEnv,
  readerChain,
  readWithFallback,
} from "../readers";

const players = [
  { playerId: 1, playerName: "Mark" },
  { playerId: 2, playerName: "Dylan" },
] as Player[];

const rocketLeagueBoard: ExtractedScoreboard = {
  teams: [
    {
      teamKey: "blue",
      players: [
        {
          name: "Mark",
          stats: { rl_score: 400, rl_goals: 3, rl_assists: 1, rl_saves: 0, rl_shots: 5 },
        },
      ],
    },
    {
      teamKey: "orange",
      players: [
        {
          name: "Dylan",
          stats: { rl_score: 100, rl_goals: 1, rl_assists: 0, rl_saves: 2, rl_shots: 2 },
        },
      ],
    },
  ],
};

describe("llmReader", () => {
  it("runs the provider's scoreboard through the game processor", async () => {
    providers.extract.mockResolvedValue(rocketLeagueBoard);
    const scheduleFlush = vi.fn();

    const result = await llmReader({ modelSpec: "local:qwen", scheduleFlush }).read({
      base64Source: "abc",
      gameId: 2,
      sessionPlayers: players,
    });

    expect(providers.create).toHaveBeenCalledWith("local:qwen", { scheduleFlush });
    expect(providers.extract).toHaveBeenCalledWith(
      expect.objectContaining({ imageBase64: "abc", gameId: 2 }),
    );
    if (result.status === VisionResultCodes.Failed) throw new Error(result.message);
    expect(result.data.players.map((p) => [p.name, p.teamKey])).toEqual([
      ["Mark", "BluePlayers"],
      ["Dylan", "OrangePlayers"],
    ]);
    expect(result.data.winner?.map((p) => p.name)).toEqual(["Mark"]);
  });

  it("falls back to the next reader when the model errors", async () => {
    providers.extract.mockRejectedValue(
      Object.assign(new Error("bad key"), { statusCode: 401 }),
    );
    const readers = createReaders({});
    const azure = { ...readers.azure, read: vi.fn(async () => ({
      status: VisionResultCodes.Success as const,
      data: { players: [], winner: [] },
      message: "",
    })) };

    const outcome = await readWithFallback(
      [llmReader(), azure],
      { base64Source: "", gameId: 2, sessionPlayers: players },
      { retry: { sleep: async () => {} } },
    );

    expect(outcome.readerId).toBe("azure");
    expect(outcome.fallbacks).toEqual([{ from: "llm", reason: "not authorized (401)" }]);
  });
});

describe("reader selection", () => {
  const ids = (primary: Parameters<typeof readerChain>[0]) =>
    readerChain(primary, createReaders({})).map((r) => r.id);

  it("puts the LLM first only when asked, always keeping Gemini and Azure behind it", () => {
    expect(ids("gemini")).toEqual(["gemini", "azure"]);
    expect(ids("azure")).toEqual(["azure"]);
    expect(ids("llm")).toEqual(["llm", "gemini", "azure"]);
  });

  it("maps VISION_PROVIDER, defaulting to Gemini", () => {
    expect(primaryReaderFromEnv(undefined)).toBe("gemini");
    expect(primaryReaderFromEnv("")).toBe("gemini");
    expect(primaryReaderFromEnv("llm")).toBe("llm");
    expect(primaryReaderFromEnv("azure-di")).toBe("azure");
    expect(primaryReaderFromEnv("something-else")).toBe("gemini");
  });
});
