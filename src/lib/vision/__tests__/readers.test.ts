import { describe, expect, it, vi } from "vitest";
import type { Player } from "@/generated/prisma/client";
import { VisionResultCodes } from "@/lib/constants";
import type { AnalysisResults } from "@/lib/visionTypes";
import { processScoreboard } from "../analyze-scoreboard";
import { geminiOutputToFields, parseGeminiText } from "../gemini-reader";
import { geminiReader, readWithFallback, type ReaderId, type ScoreboardReader } from "../readers";
import { GAMES } from "../scoreboard-specs";

const players = [
  { playerId: 1, playerName: "Mark" },
  { playerId: 2, playerName: "Dylan" },
] as Player[];

const ok: AnalysisResults = {
  status: VisionResultCodes.Success,
  data: { players: [] },
  message: "",
};

const reader = (id: ReaderId, read: ScoreboardReader["read"], supports = true): ScoreboardReader => ({
  id,
  supports: () => supports,
  read: vi.fn(read),
});
const input = { base64Source: "", gameId: 2, sessionPlayers: players };
const noWait = { retry: { sleep: async () => {} } };

describe("readWithFallback", () => {
  it("uses the first reader when it works", async () => {
    const azure = reader("azure", async () => ok);
    const outcome = await readWithFallback([reader("gemini", async () => ok), azure], input, noWait);
    expect(outcome).toMatchObject({ readerId: "gemini", fallbacks: [] });
    expect(azure.read).not.toHaveBeenCalled();
  });

  it("retries a 429 before falling back", async () => {
    const gemini = reader("gemini", async () => {
      throw Object.assign(new Error("slow down"), { statusCode: 429 });
    });
    const outcome = await readWithFallback([gemini, reader("azure", async () => ok)], input, noWait);
    expect(gemini.read).toHaveBeenCalledTimes(3);
    expect(outcome.readerId).toBe("azure");
    expect(outcome.fallbacks).toEqual([{ from: "gemini", reason: "rate limited (429)" }]);
  });

  it("falls back at once on a fatal error", async () => {
    const gemini = reader("gemini", async () => {
      throw Object.assign(new Error("bad key"), { statusCode: 401 });
    });
    const outcome = await readWithFallback([gemini, reader("azure", async () => ok)], input, noWait);
    expect(gemini.read).toHaveBeenCalledTimes(1);
    expect(outcome.readerId).toBe("azure");
  });

  it("falls back when a reader returns Failed, or doesn't support the game", async () => {
    const failed = reader("gemini", async () => ({ status: VisionResultCodes.Failed, message: "nothing" }));
    expect((await readWithFallback([failed, reader("azure", async () => ok)], input, noWait)).readerId).toBe("azure");
    const unsupported = reader("gemini", async () => ok, false);
    expect((await readWithFallback([unsupported, reader("azure", async () => ok)], input, noWait)).readerId).toBe("azure");
    expect(unsupported.read).not.toHaveBeenCalled();
  });

  it("returns Failed with every reason when all readers fail", async () => {
    const outcome = await readWithFallback(
      [
        reader("gemini", async () => {
          throw Object.assign(new Error("x"), { statusCode: 401 });
        }),
        reader("azure", async () => ({ status: VisionResultCodes.Failed, message: "no document" })),
      ],
      input,
      noWait,
    );
    expect(outcome.result).toEqual({
      status: VisionResultCodes.Failed,
      message: "gemini: not authorized (401); azure: no document",
    });
  });
});

describe("missing Gemini key", () => {
  it("falls back to Azure without calling Google", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const saved = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    try {
      const azure = reader("azure", async () => ok);
      const outcome = await readWithFallback([geminiReader({}), azure], input, noWait);
      expect(outcome.readerId).toBe("azure");
      expect(outcome.fallbacks).toEqual([
        { from: "gemini", reason: expect.stringContaining("API key is missing") },
      ]);
    } finally {
      if (saved !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = saved;
    }
  });
});

describe("Gemini output through the game processors", () => {
  const quiet = () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  };

  it("maps Rocket League teams, members and winners", () => {
    quiet();
    const row = (gamertag: string, member: "Mark" | "Dylan" | null, team: string, goals: number) => ({
      gamertag,
      member,
      team,
      stats: { rl_score: 300, rl_goals: goals, rl_assists: 1, rl_saves: 0, rl_shots: 4 },
    });
    const fields = geminiOutputToFields(GAMES["rocket-league"], {
      // "SupremeMvpOO20" isn't an exact gamertag; Gemini's member match carries it.
      players: [row("SupremeMvpOO20", "Mark", "BLUE", 3), row("random", null, "BLUE", 0), row("Dpatel254", "Dylan", "ORANGE", 1)],
      winning_team: "BLUE",
    });
    const result = processScoreboard({ fields, gameId: 2, sessionPlayers: players, ocrCorrections: false });
    if (result.status === VisionResultCodes.Failed) throw new Error(result.message);
    expect(result.data.players.map((p) => [p.name, p.teamKey])).toEqual([
      ["Mark", "BluePlayers"],
      ["Dylan", "OrangePlayers"],
    ]);
    expect(result.data.winner?.map((p) => p.name)).toEqual(["Mark"]);
    expect(result.data.players[0].stats.find((s) => s.stat === "RL_GOALS")?.statValue).toBe("3");
  });

  it("keeps a real 7th place in Mario Kart (Azure's 7→1 fix is off for Gemini)", () => {
    quiet();
    const fields = parseGeminiText(
      GAMES["mario-kart-8"],
      JSON.stringify({
        players: [
          { gamertag: "Mark", member: "Mark", team: null, stats: { mk8_place: 2 } },
          { gamertag: "Dylan", member: "Dylan", team: null, stats: { mk8_place: 7 } },
        ],
        winning_team: null,
      }),
    );
    const result = processScoreboard({ fields, gameId: 1, sessionPlayers: players, ocrCorrections: false });
    if (result.status === VisionResultCodes.Failed) throw new Error(result.message);
    expect(result.data.players.map((p) => p.stats[0].statValue)).toEqual(["2", "7"]);
  });

  it("flags a value Gemini couldn't read for review", () => {
    quiet();
    const fields = geminiOutputToFields(GAMES["mario-kart-8"], {
      players: [{ gamertag: "Mark", member: "Mark", team: null, stats: { mk8_place: null } }],
      winning_team: null,
    });
    const result = processScoreboard({ fields, gameId: 1, sessionPlayers: players, ocrCorrections: false });
    expect(result.status).toBe(VisionResultCodes.CheckRequest);
  });

  it("rejects text that doesn't match the schema", () => {
    expect(() => parseGeminiText(GAMES["mario-kart-8"], '{"players": "nope"}')).toThrow(/schema/);
  });
});
