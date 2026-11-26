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
  status: "PENDING",
  session: { isApproved: false },
  ...overrides,
});

/** Session 10: one set whose second match has Mark (1, the winner) and Dylan (2). */
const sessionTree = () => [
  {
    matches: [
      { matchId: 30, matchWinners: [], playerSessions: [] },
      {
        matchId: 31,
        matchWinners: [{ playerId: 1 }],
        playerSessions: [
          { playerSessionId: 40, playerId: 1 },
          { playerSessionId: 41, playerId: 2 },
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
    db.visionImportFlag.findUnique.mockResolvedValue(flag({ field: "PLAYER_NAME" }) as never);
    db.player.findUnique.mockResolvedValue({ playerName: "Ben" } as never);

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
