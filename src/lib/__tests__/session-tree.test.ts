import { vi } from "vitest";
import prisma from "prisma/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  resolveStatId,
  writeSessionTree,
  type SetInput,
} from "prisma/lib/session-tree";

const db = vi.mocked(prisma, { deep: true });
const tx = prisma as unknown as Prisma.TransactionClient;

const GAME_STATS = [
  { statId: 101, statName: "RL_GOALS" },
  { statId: 102, statName: "RL_SAVES" },
];
const SESSION = { sessionId: 10, gameId: 3, date: new Date("2025-03-01") };

const player = (playerId: number, goals: string, saves: string) => ({
  playerId,
  playerStats: [
    { statId: 101, stat: "RL_GOALS", statValue: goals },
    { statId: 102, stat: "RL_SAVES", statValue: saves },
  ],
});

const set = (setId: number, winnerId = 1): SetInput => ({
  setId,
  setWinners: [{ playerId: winnerId }],
  matches: [
    {
      matchWinners: [{ playerId: winnerId }],
      playerSessions: [player(1, "3", "1"), player(2, "1", "4")],
    },
  ],
});

/** Hands out increasing ids so parent/child links can be asserted. */
const sequence = (key: string, start: number) => {
  let next = start;
  return (() => Promise.resolve({ [key]: next++ })) as never;
};

beforeEach(() => {
  db.gameStat.findMany.mockResolvedValue(GAME_STATS as never);
  db.player.findMany.mockResolvedValue([{ playerId: 1 }, { playerId: 2 }] as never);
  db.gameSet.create.mockImplementation(sequence("setId", 20));
  db.match.create.mockImplementation(sequence("matchId", 30));
  db.playerSession.create.mockImplementation(sequence("playerSessionId", 40));
});

describe("resolveStatId", () => {
  it("uses the submitted id when it is the game's stat of that name", () => {
    expect(resolveStatId(GAME_STATS, { statId: 102, stat: "RL_SAVES" })).toBe(102);
  });

  it("accepts the stringified ids stored by older edit proposals", () => {
    expect(resolveStatId(GAME_STATS, { statId: "101", stat: "RL_GOALS" })).toBe(101);
  });

  it("looks the stat up by name when the id is not one of the game's stats", () => {
    expect(resolveStatId(GAME_STATS, { statId: 7, stat: "RL_SAVES" })).toBe(102);
  });

  it("lets the name win when the id points at a different stat of the game", () => {
    expect(resolveStatId(GAME_STATS, { statId: 101, stat: "RL_SAVES" })).toBe(102);
  });

  it("accepts a valid id on its own when no name was stored", () => {
    expect(resolveStatId(GAME_STATS, { statId: 101 })).toBe(101);
  });

  it.each([
    ["an unknown name", { statId: 101, stat: "COD_KILLS" }],
    ["an unknown id with no name", { statId: 7 }],
    ["neither", {}],
  ])("throws for %s", (_label, stat) => {
    expect(() => resolveStatId(GAME_STATS, stat)).toThrow("GameStat not found");
  });
});

describe("writeSessionTree", () => {
  it("creates every set, match, player session and stat under its parent", async () => {
    await writeSessionTree(tx, SESSION, [set(1), set(2, 2)]);

    expect(db.gameStat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gameId: 3 } }),
    );
    expect(db.gameSet.create.mock.calls).toEqual([
      [{ data: { sessionId: 10 } }],
      [{ data: { sessionId: 10 } }],
    ]);
    expect(db.gameSet.update.mock.calls).toEqual([
      [{ where: { setId: 20 }, data: { setWinners: { connect: [{ playerId: 1 }] } } }],
      [{ where: { setId: 21 }, data: { setWinners: { connect: [{ playerId: 2 }] } } }],
    ]);
    expect(db.match.create.mock.calls).toEqual([
      [{ data: { setId: 20, matchWinners: { connect: [{ playerId: 1 }] } } }],
      [{ data: { setId: 21, matchWinners: { connect: [{ playerId: 2 }] } } }],
    ]);
    expect(db.playerSession.create.mock.calls.map(([arg]) => arg.data)).toEqual([
      { playerId: 1, sessionId: 10, matchId: 30, setId: 20 },
      { playerId: 2, sessionId: 10, matchId: 30, setId: 20 },
      { playerId: 1, sessionId: 10, matchId: 31, setId: 21 },
      { playerId: 2, sessionId: 10, matchId: 31, setId: 21 },
    ]);

    const stat = (playerId: number, playerSessionId: number, statId: number, value: string) => ({
      playerId,
      gameId: 3,
      playerSessionId,
      statId,
      value,
      date: SESSION.date,
    });
    // Every stat of the session goes in with a single insert.
    expect(db.playerStat.createMany.mock.calls.map(([arg]) => arg?.data)).toEqual([
      [
        stat(1, 40, 101, "3"),
        stat(1, 40, 102, "1"),
        stat(2, 41, 101, "1"),
        stat(2, 41, 102, "4"),
        stat(1, 42, 101, "3"),
        stat(1, 42, 102, "1"),
        stat(2, 43, 101, "1"),
        stat(2, 43, 102, "4"),
      ],
    ]);
    expect(db.gameSet.deleteMany).not.toHaveBeenCalled();
    expect(db.match.deleteMany).not.toHaveBeenCalled();
  });

  it("resolves stale stat ids by name before writing them", async () => {
    const stale = set(1);
    stale.matches![0].playerSessions = [
      { playerId: 1, playerStats: [{ statId: 1, stat: "RL_SAVES", statValue: "9" }] },
    ];

    await writeSessionTree(tx, SESSION, [stale]);

    expect(db.playerStat.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ statId: 102, value: "9" })],
    });
  });

  it("writes nothing when any stat is not defined for the game", async () => {
    const bad = set(2);
    bad.matches![0].playerSessions![1].playerStats![0].stat = "COD_KILLS";

    await expect(writeSessionTree(tx, SESSION, [set(1), bad])).rejects.toThrow(
      "GameStat not found: COD_KILLS",
    );

    expect(db.gameSet.create).not.toHaveBeenCalled();
    expect(db.playerStat.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ["player session", (s: SetInput) => (s.matches![0].playerSessions![0].playerId = 9)],
    ["set winner", (s: SetInput) => (s.setWinners = [{ playerId: 9 }])],
    ["match winner", (s: SetInput) => (s.matches![0].matchWinners = [{ playerId: 9 }])],
  ])("writes nothing when a %s references an unknown player", async (_label, mutate) => {
    const bad = set(1);
    mutate(bad);

    await expect(writeSessionTree(tx, SESSION, [bad])).rejects.toThrow("Player not found: 9");

    expect(db.gameSet.create).not.toHaveBeenCalled();
    expect(db.gameSet.update).not.toHaveBeenCalled();
  });

  it("tolerates matches with no winners and players with no stats", async () => {
    await writeSessionTree(tx, SESSION, [
      { setId: 1, matches: [{ playerSessions: [{ playerId: 1 }] }] },
    ]);

    expect(db.gameSet.update).not.toHaveBeenCalled();
    expect(db.match.create).toHaveBeenCalledWith({
      data: { setId: 20, matchWinners: { connect: [] } },
    });
    expect(db.playerSession.create).toHaveBeenCalledTimes(1);
    expect(db.playerStat.createMany).not.toHaveBeenCalled();
  });

  describe("replacing an existing tree", () => {
    it("keeps the sets and rebuilds their winners and matches when the proposal maps 1:1", async () => {
      await writeSessionTree(tx, SESSION, [set(5, 2), set(6)], { replacingSetIds: [6, 5] });

      expect(db.gameSet.deleteMany).not.toHaveBeenCalled();
      expect(db.gameSet.create).not.toHaveBeenCalled();
      expect(db.gameSet.update.mock.calls).toEqual([
        [{ where: { setId: 5 }, data: { setWinners: { set: [{ playerId: 2 }] } } }],
        [{ where: { setId: 6 }, data: { setWinners: { set: [{ playerId: 1 }] } } }],
      ]);
      expect(db.match.deleteMany.mock.calls).toEqual([
        [{ where: { setId: 5 } }],
        [{ where: { setId: 6 } }],
      ]);
      expect(db.match.create.mock.calls.map(([arg]) => arg.data.setId)).toEqual([5, 6]);
      expect(db.playerStat.createMany).toHaveBeenCalledTimes(1);
      expect(db.playerStat.createMany.mock.calls[0][0]?.data).toHaveLength(8);
    });

    it.each([
      ["a set was added", [set(5), set(6)], [5]],
      ["a set was removed", [set(5)], [5, 6]],
      ["a set id is unknown", [set(5), set(99)], [5, 6]],
      ["a set id is repeated", [set(5), set(5)], [5, 6]],
    ])("deletes and recreates every set when %s", async (_label, sets, replacingSetIds) => {
      await writeSessionTree(tx, SESSION, sets, { replacingSetIds });

      expect(db.gameSet.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 10 } });
      expect(db.match.deleteMany).not.toHaveBeenCalled();
      expect(db.gameSet.create).toHaveBeenCalledTimes(sets.length);
    });

    it("leaves the existing tree alone when the proposal is invalid", async () => {
      db.player.findMany.mockResolvedValue([{ playerId: 1 }] as never);

      await expect(
        writeSessionTree(tx, SESSION, [set(5)], { replacingSetIds: [5] }),
      ).rejects.toThrow("Player not found: 2");

      expect(db.gameSet.update).not.toHaveBeenCalled();
      expect(db.match.deleteMany).not.toHaveBeenCalled();
      expect(db.gameSet.deleteMany).not.toHaveBeenCalled();
    });
  });
});
