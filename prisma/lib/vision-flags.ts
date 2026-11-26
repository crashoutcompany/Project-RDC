import type { Prisma } from "@/generated/prisma/client";
import { handlePrismaOperation } from "prisma/db";
import { stillHoldsRead } from "@/lib/vision/import-flags";

/** Open and rejected vision flags on one session, for the approve page warning. */
export const getVisionFlagCounts = async (sessionId: number) => {
  const res = await handlePrismaOperation((prisma) =>
    prisma.visionImportFlag.findMany({
      where: { sessionId, status: { in: ["PENDING", "REJECTED"] } },
      select: { status: true },
    }),
  );
  const flags = res.success ? res.data : [];
  return {
    pending: flags.filter((flag) => flag.status === "PENDING").length,
    rejected: flags.filter((flag) => flag.status === "REJECTED").length,
  };
};

/** A session's sets in order (by setId), each with its matches in order (by matchId). */
export const loadFlagTree = (tx: Prisma.TransactionClient, sessionId: number) =>
  tx.gameSet.findMany({
    where: { sessionId },
    orderBy: { setId: "asc" },
    select: {
      matches: {
        orderBy: { matchId: "asc" },
        select: {
          matchId: true,
          matchWinners: { select: { playerId: true } },
          playerSessions: {
            select: {
              playerSessionId: true,
              playerId: true,
              playerStats: {
                select: { value: true, gameStat: { select: { statName: true } } },
              },
            },
          },
        },
      },
    },
  });

export type FlagTree = Awaited<ReturnType<typeof loadFlagTree>>;
export type FlagTreeMatch = FlagTree[number]["matches"][number];

type FlagPosition = { setIndex: number; matchIndex: number; playerId: number };

/** The match a flag points at, by position. */
export const matchAt = (tree: FlagTree, flag: FlagPosition) =>
  tree[flag.setIndex]?.matches[flag.matchIndex];

/** The flagged player's stats at the flag's position; undefined if they aren't there. */
export const statsAt = (tree: FlagTree, flag: FlagPosition) =>
  matchAt(tree, flag)
    ?.playerSessions.find((ps) => ps.playerId === flag.playerId)
    ?.playerStats.map((stat) => ({
      statName: stat.gameStat.statName,
      value: stat.value,
    }));

/**
 * Run after an edit rewrites a session's tree. Deletes every open or rejected
 * flag whose spot no longer holds the value vision read: the edit changed
 * that field (so a rejected field was fixed), or added or removed sets or
 * matches so the position now points at another match. Either way the flag
 * no longer describes saved data. Never touches approval.
 */
export async function reconcileVisionFlags(
  tx: Prisma.TransactionClient,
  sessionId: number,
) {
  const flags = await tx.visionImportFlag.findMany({
    where: { sessionId, status: { in: ["PENDING", "REJECTED"] } },
    select: {
      id: true,
      setIndex: true,
      matchIndex: true,
      playerId: true,
      field: true,
      readValue: true,
    },
  });
  if (flags.length === 0) return;

  const tree = await loadFlagTree(tx, sessionId);
  const stale = flags.filter((flag) => !stillHoldsRead(flag, statsAt(tree, flag)));
  if (stale.length > 0)
    await tx.visionImportFlag.deleteMany({
      where: { id: { in: stale.map((flag) => flag.id) } },
    });
}
