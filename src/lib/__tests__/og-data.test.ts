import { vi } from "vitest";
import prisma from "prisma/db";
import { getMemberCardData } from "@/lib/og-data";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
  revalidateTag: vi.fn(),
}));

const db = vi.mocked(prisma, { deep: true });

const APPROVED_SET = { session: { isApproved: true } };

describe("getMemberCardData", () => {
  it("counts only approved wins and loads no stats or sessions", async () => {
    db.player.findFirst.mockResolvedValue({
      playerName: "Mark",
      _count: { matchWins: 1, setWins: 1, dayWins: 0 },
    } as never);

    const res = await getMemberCardData("Mark");

    expect(res.data?._count).toEqual({ matchWins: 1, setWins: 1, dayWins: 0 });
    expect(db.player.findFirst).toHaveBeenCalledWith({
      where: {
        playerName: { equals: "Mark", mode: "insensitive" },
      },
      select: {
        playerName: true,
        _count: {
          select: {
            matchWins: { where: { set: APPROVED_SET } },
            setWins: { where: APPROVED_SET },
            dayWins: { where: { isApproved: true } },
          },
        },
      },
    });
  });
});
