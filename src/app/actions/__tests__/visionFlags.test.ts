import { vi } from "vitest";
import prisma from "prisma/db";
import { signInAs, TEST_USERS } from "@/test/session";
import { listFlaggedImports, resolveVisionFlag } from "../visionFlags";

const db = vi.mocked(prisma, { deep: true });

const flag = (overrides: Record<string, unknown> = {}) => ({
  id: 5,
  sessionId: 10,
  setIndex: 0,
  matchIndex: 1,
  playerId: 1,
  field: "MK8_POS",
  readValue: "2",
  status: "PENDING",
  session: { isApproved: false },
  ...overrides,
});

const place = (value: string) => [{ value, gameStat: { statName: "MK8_POS" } }];

/** Session 10: one set whose second match has Mark (1, the winner, read 2nd) and Dylan (2). */
const sessionTree = () => [
  {
    matches: [
      { matchId: 30, matchWinners: [], playerSessions: [] },
      {
        matchId: 31,
        matchWinners: [{ playerId: 1 }],
        playerSessions: [
          { playerSessionId: 40, playerId: 1, playerStats: place("2") },
          { playerSessionId: 41, playerId: 2, playerStats: place("1") },
        ],
      },
    ],
  },
];

beforeEach(() => {
  signInAs("admin");
  db.visionImportFlag.updateMany.mockResolvedValue({ count: 1 } as never);
  db.gameSet.findMany.mockResolvedValue(sessionTree() as never);
});

describe("listFlaggedImports", () => {
  it("lists open flags on sessions not yet approved", async () => {
    db.visionImportFlag.findMany.mockResolvedValue([{ id: 5, sessionId: 10 }] as never);

    const result = await listFlaggedImports();

    expect(result.error).toBeNull();
    expect(db.visionImportFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PENDING", session: { isApproved: false } },
      }),
    );
    expect(db.playerSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sessionId: { in: [10] } } }),
    );
  });
});

describe("resolveVisionFlag", () => {
  it("confirms a flag without touching the stats", async () => {
    db.visionImportFlag.findUnique.mockResolvedValue(flag() as never);

    expect(await resolveVisionFlag(5, { action: "confirm" })).toEqual({ error: null });

    expect(db.visionImportFlag.updateMany).toHaveBeenCalledWith({
      where: { id: 5, status: "PENDING" },
      data: expect.objectContaining({
        status: "CONFIRMED",
        reviewedBy: TEST_USERS.admin.email,
      }),
    });
    expect(db.playerStat.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a flag without touching the stats", async () => {
    db.visionImportFlag.findUnique.mockResolvedValue(flag() as never);

    expect(await resolveVisionFlag(5, { action: "reject" })).toEqual({ error: null });

    expect(db.visionImportFlag.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED" }) }),
    );
    expect(db.playerStat.updateMany).not.toHaveBeenCalled();
  });

  it("corrects a misread place on the flagged match's player", async () => {
    db.visionImportFlag.findUnique.mockResolvedValue(flag() as never);
    db.playerStat.updateMany.mockResolvedValue({ count: 1 } as never);

    expect(await resolveVisionFlag(5, { action: "correct", value: " 01 " })).toEqual({ error: null });

    expect(db.playerStat.updateMany).toHaveBeenCalledWith({
      where: { playerSessionId: 40, gameStat: { statName: "MK8_POS" } },
      data: { value: "1" },
    });
    expect(db.visionImportFlag.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CORRECTED", correctedValue: "1" }),
      }),
    );
  });

  it("refuses a correction that isn't a whole number", async () => {
    db.visionImportFlag.findUnique.mockResolvedValue(flag() as never);

    expect(await resolveVisionFlag(5, { action: "correct", value: "1st" })).toEqual({
      error: "Enter a whole number.",
    });
    expect(db.playerStat.updateMany).not.toHaveBeenCalled();
  });

  it("moves a misread name's row, stats and match win to the right player", async () => {
    db.visionImportFlag.findUnique.mockResolvedValue(
      flag({ field: "PLAYER_NAME", readValue: "Mark" }) as never,
    );
    db.playerSession.findFirst.mockResolvedValue({ player: { playerName: "Ben" } } as never);

    expect(await resolveVisionFlag(5, { action: "correct", value: "3" })).toEqual({ error: null });

    expect(db.playerSession.update).toHaveBeenCalledWith({
      where: { playerSessionId: 40 },
      data: { playerId: 3 },
    });
    expect(db.playerStat.updateMany).toHaveBeenCalledWith({
      where: { playerSessionId: 40 },
      data: { playerId: 3 },
    });
    expect(db.match.update).toHaveBeenCalledWith({
      where: { matchId: 31 },
      data: {
        matchWinners: { disconnect: { playerId: 1 }, connect: { playerId: 3 } },
      },
    });
    expect(db.visionImportFlag.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CORRECTED", correctedValue: "Ben" }),
      }),
    );
  });

  it("looks for the corrected player among this session's players only", async () => {
    db.visionImportFlag.findUnique.mockResolvedValue(
      flag({ field: "PLAYER_NAME", readValue: "Mark" }) as never,
    );
    db.playerSession.findFirst.mockResolvedValue(null);

    expect(await resolveVisionFlag(5, { action: "correct", value: "99" })).toEqual({
      error: "That player isn't in this session.",
    });
    expect(db.playerSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sessionId: 10, playerId: 99 } }),
    );
    expect(db.playerSession.update).not.toHaveBeenCalled();
    expect(db.visionImportFlag.updateMany).not.toHaveBeenCalled();
  });

  it("won't correct a stat an edit already changed", async () => {
    db.visionImportFlag.findUnique.mockResolvedValue(flag({ readValue: "7" }) as never);

    expect(await resolveVisionFlag(5, { action: "correct", value: "1" })).toEqual({
      error: "This field changed since import. Review it from Edit.",
    });
    expect(db.playerStat.updateMany).not.toHaveBeenCalled();
    expect(db.visionImportFlag.updateMany).not.toHaveBeenCalled();
  });

  it("won't write to another match after an edit removed the flagged one", async () => {
    // Flagged: Mark read 2nd in match 0. An edit then removed match 0, so
    // position 0 is now the old second match, where Mark finished 4th.
    db.visionImportFlag.findUnique.mockResolvedValue(flag({ matchIndex: 0 }) as never);
    db.gameSet.findMany.mockResolvedValue([
      {
        matches: [
          {
            matchId: 32,
            matchWinners: [{ playerId: 2 }],
            playerSessions: [
              { playerSessionId: 42, playerId: 1, playerStats: place("4") },
              { playerSessionId: 43, playerId: 2, playerStats: place("1") },
            ],
          },
        ],
      },
    ] as never);

    expect(await resolveVisionFlag(5, { action: "correct", value: "1" })).toEqual({
      error: "This field changed since import. Review it from Edit.",
    });
    expect(db.playerStat.updateMany).not.toHaveBeenCalled();
  });

  it("won't move a row onto a player already in the match", async () => {
    db.visionImportFlag.findUnique.mockResolvedValue(flag({ field: "PLAYER_NAME" }) as never);

    expect(await resolveVisionFlag(5, { action: "correct", value: "2" })).toEqual({
      error: "That player is already in this match.",
    });
    expect(db.playerSession.update).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing flag", null, "Flag not found."],
    ["a reviewed flag", flag({ status: "CONFIRMED" }), "This flag was already reviewed."],
    [
      "an approved session",
      flag({ session: { isApproved: true } }),
      "This session is already approved. Use an edit request to change it.",
    ],
  ])("changes nothing for %s", async (_label, found, error) => {
    db.visionImportFlag.findUnique.mockResolvedValue(found as never);

    expect(await resolveVisionFlag(5, { action: "correct", value: "1" })).toEqual({ error });
    expect(db.playerStat.updateMany).not.toHaveBeenCalled();
    expect(db.visionImportFlag.updateMany).not.toHaveBeenCalled();
  });

  it("loses a race with another reviewer instead of applying twice", async () => {
    db.visionImportFlag.findUnique.mockResolvedValue(flag() as never);
    db.visionImportFlag.updateMany.mockResolvedValue({ count: 0 } as never);

    expect(await resolveVisionFlag(5, { action: "confirm" })).toEqual({
      error: "This flag was already reviewed.",
    });
  });
});
