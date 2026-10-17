import { vi } from "vitest";
import prisma from "prisma/db";
import { getMember } from "@/app/(routes)/(groups)/members/[slug]/data";
import {
  approvedSession,
  inApprovedMatch,
  inApprovedPlayerSession,
  inApprovedPlayerStat,
  inApprovedSet,
} from "prisma/lib/approved";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
  revalidateTag: vi.fn(),
}));

const db = vi.mocked(prisma, { deep: true });

describe("getMember", () => {
  it("counts only approved sessions toward wins, days won and stats", async () => {
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
        matchWins: { where: inApprovedMatch },
        setWins: { where: inApprovedSet },
        dayWins: { where: approvedSession },
        playerStats: {
          where: inApprovedPlayerStat,
          include: { game: true, gameStat: true },
        },
        playerSessions: {
          where: inApprovedPlayerSession,
          include: { playerStats: true },
        },
      },
    });
  });
});
