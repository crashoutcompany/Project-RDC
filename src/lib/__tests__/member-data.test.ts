import { vi } from "vitest";
import prisma from "prisma/db";
import { getMember } from "@/app/(routes)/(groups)/members/[slug]/data";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
  revalidateTag: vi.fn(),
}));

const db = vi.mocked(prisma, { deep: true });

// Spelled out rather than imported from prisma/lib/approved, so loosening
// those filters fails this test instead of silently passing.
const APPROVED_SET = { session: { isApproved: true } };
const SESSION_FIELDS = {
  sessionId: true,
  sessionName: true,
  date: true,
  Game: { select: { gameName: true } },
};
const SESSION = { select: SESSION_FIELDS };

describe("getMember", () => {
  it("filters wins, days won and stats to approved sessions", async () => {
    db.player.findFirst.mockResolvedValue({
      playerId: 1,
      playerName: "Mark",
    } as never);

    await getMember("Mark");

    expect(db.player.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        playerName: { equals: "Mark", mode: "insensitive" },
      }),
      include: {
        matchWins: {
          where: { set: APPROVED_SET },
          select: { matchId: true, set: { select: { session: SESSION } } },
        },
        setWins: { where: APPROVED_SET },
        dayWins: { where: { isApproved: true } },
        mvpOf: {
          where: { isApproved: true },
          select: SESSION_FIELDS,
          orderBy: { date: "desc" },
        },
        playerStats: {
          where: { playerSession: { set: APPROVED_SET } },
          include: { game: true, gameStat: true },
        },
        playerSessions: {
          where: { set: APPROVED_SET },
          select: { matchId: true, set: { select: { session: SESSION } } },
        },
      },
    });
  });
});
