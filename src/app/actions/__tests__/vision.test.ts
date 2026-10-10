import { vi } from "vitest";

const azure = vi.hoisted(() => ({
  post: vi.fn(),
  result: vi.fn(),
}));

// Only the Azure boundary is faked; game processors run for real.
vi.mock("@azure-rest/ai-document-intelligence", () => ({
  default: vi.fn(() => ({
    path: vi.fn(() => ({ post: (...args: unknown[]) => azure.post(...args) })),
  })),
  getLongRunningPoller: vi.fn(async () => ({
    get body() {
      return azure.result();
    },
  })),
  isUnexpected: vi.fn(() => false),
}));

import prisma from "prisma/db";
import { VisionResultCodes } from "@/lib/constants";
import { signInAs } from "@/test/session";
import { handleAnalyzeBtnClick } from "@/app/(routes)/admin/_utils/rdc-vision-helpers";
import type { Player } from "@/generated/prisma/client";

const db = vi.mocked(prisma, { deep: true });

const sessionPlayers = [
  { playerId: 1, playerName: "Mark" },
  { playerId: 2, playerName: "Dylan" },
] as Player[];

/** Azure "RDC-MK8" model output: one array field of per-player objects. */
const mk8Document = (rows: [gamerTag: string, place: string][]) => ({
  analyzeResult: {
    documents: [
      {
        fields: {
          players: {
            type: "array",
            valueArray: rows.map(([tag, place]) => ({
              type: "object",
              valueObject: {
                PlayerName: { content: tag },
                mk8_place: { content: place },
              },
            })),
          },
        },
      },
    ],
  },
});

const analyze = () => handleAnalyzeBtnClick("base64", sessionPlayers, "Mario Kart 8");

type RlRow = [gamerTag: string, fields: Record<string, string>];

/** Azure "RDC-RL" model output: one array field per team. */
const rlDocument = (teams: Record<string, RlRow[]>) => ({
  analyzeResult: {
    documents: [
      {
        fields: Object.fromEntries(
          Object.entries(teams).map(([team, rows]) => [
            team,
            {
              type: "array",
              valueArray: rows.map(([tag, fields]) => ({
                type: "object",
                valueObject: {
                  PlayerName: { content: tag },
                  ...Object.fromEntries(
                    Object.entries(fields).map(([k, v]) => [k, { content: v }]),
                  ),
                },
              })),
            },
          ]),
        ),
      },
    ],
  },
});

const analyzeRl = () => handleAnalyzeBtnClick("base64", sessionPlayers, "Rocket League");

beforeEach(() => {
  signInAs("admin");
  db.game.findFirst.mockResolvedValue({ gameId: 1 } as never);
  azure.post.mockResolvedValue({});
});

describe("screenshot analysis (handleAnalyzeBtnClick)", () => {
  it("maps gamer tags to session players and picks the lowest Mario Kart position as winner", async () => {
    azure.result.mockResolvedValue(
      mk8Document([
        ["SupremeMvp0020", "2"],
        ["Dpatel254", "1"],
      ]),
    );

    const result = await analyze();

    expect(result.status).toBe(VisionResultCodes.Success);
    if (result.status === VisionResultCodes.Failed) return;
    expect(result.data.players).toEqual([
      expect.objectContaining({ playerId: 1, name: "Mark", stats: [expect.objectContaining({ stat: "MK8_POS", statValue: "2" })] }),
      expect.objectContaining({ playerId: 2, name: "Dylan", stats: [expect.objectContaining({ stat: "MK8_POS", statValue: "1" })] }),
    ]);
    expect(result.data.winner).toEqual([expect.objectContaining({ playerId: 2 })]);
  });

  it("drops players who are not in the session", async () => {
    azure.result.mockResolvedValue(
      mk8Document([
        ["SupremeMvp0020", "1"],
        ["Random Lobby Player", "2"],
      ]),
    );

    const result = await analyze();

    if (result.status === VisionResultCodes.Failed) throw new Error(result.message);
    expect(result.data.players.map((p) => p.name)).toEqual(["Mark"]);
  });

  it("asks for review when OCR returns an unreadable stat", async () => {
    azure.result.mockResolvedValue(
      mk8Document([
        ["SupremeMvp0020", "Z"],
        ["Dpatel254", "1"],
      ]),
    );

    expect((await analyze()).status).toBe(VisionResultCodes.CheckRequest);
  });

  it("corrects the common OCR misread of 1st place as 7th in small lobbies and asks for review", async () => {
    azure.result.mockResolvedValue(mk8Document([["SupremeMvp0020", "7"]]));

    const result = await analyze();

    expect(result.status).toBe(VisionResultCodes.CheckRequest);
    if (result.status === VisionResultCodes.Failed) return;
    expect(result.data.players[0].stats[0].statValue).toBe("1");
  });

  it.each([
    ["Azure rejects the request", () => azure.post.mockRejectedValue(new Error("API Error")), "API Error"],
    ["Azure returns no documents", () => azure.result.mockResolvedValue({}), "Analyze result or documents are undefined"],
  ])("fails cleanly when %s", async (_label, arrange, message) => {
    arrange();

    expect(await analyze()).toEqual({ status: VisionResultCodes.Failed, message });
  });

  it("fails for a game that is not in the database", async () => {
    db.game.findFirst.mockResolvedValue(null);

    expect(await analyze()).toEqual({
      status: VisionResultCodes.Failed,
      message: 'Unable to find game "Mario Kart 8". Please verify the game name is correct.',
    });
    expect(azure.post).not.toHaveBeenCalled();
  });

  it("fails for a game without a vision model", async () => {
    db.game.findFirst.mockResolvedValue({ gameId: 999 } as never);

    expect(await analyze()).toEqual({
      status: VisionResultCodes.Failed,
      message: "Invalid game id: 999",
    });
  });
});

describe("Rocket League screenshot analysis", () => {
  beforeEach(() => {
    db.game.findFirst.mockResolvedValue({ gameId: 2 } as never);
  });

  it("reads both teams even though the model only prefixes orange's fields", async () => {
    azure.result.mockResolvedValue(
      rlDocument({
        BluePlayers: [["Dpatel254", { Score: "250", Goals: "2", Assists: "1", Saves: "0", Shots: "2" }]],
        OrangePlayers: [["SupremeMvp0020", { RL_Score: "132", RL_Goals: "1", RL_Assists: "0", RL_Saves: "0", RL_Shots: "1" }]],
      }),
    );

    const result = await analyzeRl();

    if (result.status === VisionResultCodes.Failed) throw new Error(result.message);
    const dylan = result.data.players.find((p) => p.name === "Dylan")!;
    expect(dylan.stats.map((s) => s.stat)).toEqual(["RL_SCORE", "RL_GOALS", "RL_ASSISTS", "RL_SAVES", "RL_SHOTS"]);
    // Winners come from summed goals, so blue's goals must count.
    expect(result.data.winner).toEqual([expect.objectContaining({ playerId: 2 })]);
  });

  it("drops an unreadable row and asks for review instead of crashing", async () => {
    azure.result.mockResolvedValue(
      rlDocument({
        BluePlayers: [["Dpatel254", { Goals: "1" }]],
        OrangePlayers: [
          ["SupremeMvp0020", { RL_Goals: "0" }],
          ["HAPPY CAMPER", { RL_Goals: "0" }],
        ],
      }),
    );

    const result = await analyzeRl();

    expect(result.status).toBe(VisionResultCodes.CheckRequest);
    if (result.status === VisionResultCodes.Failed) return;
    expect(result.data.players.map((p) => p.name)).toEqual(["Dylan", "Mark"]);
  });

  it("keeps the first value of a merged cell and asks for review", async () => {
    azure.result.mockResolvedValue(
      rlDocument({ BluePlayers: [["Dpatel254", { Score: "140\n38", Goals: "0" }]] }),
    );

    const result = await analyzeRl();

    expect(result.status).toBe(VisionResultCodes.CheckRequest);
    if (result.status === VisionResultCodes.Failed) return;
    expect(result.data.players[0].stats[0]).toEqual(expect.objectContaining({ stat: "RL_SCORE", statValue: "140" }));
  });
});
