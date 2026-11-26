import type { Prisma } from "@/generated/prisma/client";
import { reconcileVisionFlags } from "./vision-flags";

type PlayerRef = { playerId: number };

/** A submitted stat row. Stored edit proposals may carry a stringified id. */
export type StatInput = {
  statId?: number | string;
  stat?: string;
  statValue: string;
};

export type MatchInput = {
  matchWinners?: PlayerRef[];
  playerSessions?: { playerId: number; playerStats?: StatInput[] }[];
};

export type SetInput = {
  setId: number;
  setWinners?: PlayerRef[];
  matches?: MatchInput[];
};

/** The session the tree hangs off. `date` is stamped on every player stat. */
export type SessionRef = { sessionId: number; gameId: number; date: Date };

type GameStatRef = { statId: number; statName: string };

/** Large sessions outlast Prisma's default 5s interactive transaction timeout. */
export const SESSION_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

const toRefs = (players: PlayerRef[] = []) =>
  players.map(({ playerId }) => ({ playerId }));

/**
 * The one rule for turning a submitted stat into a `GameStat` id.
 *
 * A stat id is used only when it belongs to this game and agrees with the
 * submitted stat name; otherwise the name is looked up among the game's
 * stats. Ids from another game, stale ids, and ids the vision import took
 * from the static stat table are therefore never written as-is.
 */
export function resolveStatId(
  gameStats: GameStatRef[],
  { statId, stat }: Pick<StatInput, "statId" | "stat">,
): number {
  const byId = gameStats.find((gs) => gs.statId === Number(statId));
  if (byId && (!stat || byId.statName === stat)) return byId.statId;

  const byName = stat && gameStats.find((gs) => gs.statName === stat);
  if (byName) return byName.statId;

  throw new Error(`GameStat not found: ${stat ?? statId}`);
}

/**
 * Checks everything the tree references before any row is written, so a bad
 * submission fails with a clear message instead of midway through the write.
 */
async function loadGameStats(
  tx: Prisma.TransactionClient,
  session: SessionRef,
  sets: SetInput[],
): Promise<GameStatRef[]> {
  const matches = sets.flatMap((set) => set.matches ?? []);
  const playerSessions = matches.flatMap((m) => m.playerSessions ?? []);

  const gameStats = await tx.gameStat.findMany({
    where: { gameId: session.gameId },
    select: { statId: true, statName: true },
  });
  for (const ps of playerSessions)
    for (const stat of ps.playerStats ?? []) resolveStatId(gameStats, stat);

  const playerIds = new Set([
    ...playerSessions.map((ps) => ps.playerId),
    ...sets.flatMap((set) => set.setWinners ?? []).map((p) => p.playerId),
    ...matches.flatMap((m) => m.matchWinners ?? []).map((p) => p.playerId),
  ]);
  const known = new Set(
    (
      await tx.player.findMany({
        where: { playerId: { in: [...playerIds] } },
        select: { playerId: true },
      })
    ).map((p) => p.playerId),
  );
  for (const playerId of playerIds)
    if (!known.has(playerId)) throw new Error(`Player not found: ${playerId}`);

  return gameStats;
}

/**
 * Creates a set's matches and player sessions, and returns their stat rows
 * for the caller to insert in one batch.
 */
async function createMatches(
  tx: Prisma.TransactionClient,
  session: SessionRef,
  setId: number,
  matches: MatchInput[],
  gameStats: GameStatRef[],
) {
  const stats: Prisma.PlayerStatCreateManyInput[] = [];
  for (const match of matches) {
    const { matchId } = await tx.match.create({
      data: { setId, matchWinners: { connect: toRefs(match.matchWinners) } },
    });

    for (const ps of match.playerSessions ?? []) {
      const { playerSessionId } = await tx.playerSession.create({
        data: {
          playerId: ps.playerId,
          sessionId: session.sessionId,
          matchId,
          setId,
        },
      });

      for (const stat of ps.playerStats ?? [])
        stats.push({
          playerId: ps.playerId,
          gameId: session.gameId,
          playerSessionId,
          statId: resolveStatId(gameStats, stat),
          value: stat.statValue,
          date: session.date,
        });
    }
  }
  return stats;
}

/** True when the proposal maps 1:1 onto the session's existing sets. */
function matchesExistingSets(existingSetIds: number[], sets: SetInput[]) {
  const existing = new Set(existingSetIds);
  const proposed = new Set(sets.map((set) => set.setId));
  return (
    sets.length === existingSetIds.length &&
    proposed.size === sets.length &&
    [...proposed].every((id) => existing.has(id))
  );
}

/**
 * Writes a session's set > match > playerSession > playerStat tree. Must run
 * inside a transaction: the tree is validated first, then written in order.
 *
 * New sessions pass no options and every set is created. Edits pass the
 * session's current set ids as `replacingSetIds`: a proposal that maps 1:1
 * onto them keeps the sets and rebuilds their winners and matches; anything
 * else (sets added, removed or swapped) deletes every set and recreates them,
 * so no proposed set is silently skipped.
 *
 * Edits also drop vision flags the rewrite made stale (see
 * `reconcileVisionFlags`).
 *
 * `onlySetIds` narrows the in-place case to the sets an edit actually
 * changed; the rest are left untouched, so a stale proposal for one set can't
 * overwrite newer edits to the others. It is ignored when sets are replaced.
 */
export async function writeSessionTree(
  tx: Prisma.TransactionClient,
  session: SessionRef,
  sets: SetInput[],
  {
    replacingSetIds,
    onlySetIds,
  }: { replacingSetIds?: number[]; onlySetIds?: number[] } = {},
) {
  const inPlace =
    !!replacingSetIds && matchesExistingSets(replacingSetIds, sets);
  const toWrite =
    inPlace && onlySetIds
      ? sets.filter((set) => onlySetIds.includes(set.setId))
      : sets;
  const gameStats = await loadGameStats(tx, session, toWrite);
  // Every stat of the session goes in with one insert at the end, instead of
  // one round trip per player per match.
  const stats: Prisma.PlayerStatCreateManyInput[] = [];
  const createMatchesOf = async (set: SetInput, setId: number) =>
    stats.push(
      ...(await createMatches(
        tx,
        session,
        setId,
        set.matches ?? [],
        gameStats,
      )),
    );

  if (inPlace) {
    for (const set of toWrite) {
      await tx.gameSet.update({
        where: { setId: set.setId },
        data: { setWinners: { set: toRefs(set.setWinners) } },
      });
      await tx.match.deleteMany({ where: { setId: set.setId } });
      await createMatchesOf(set, set.setId);
    }
  } else {
    if (replacingSetIds)
      await tx.gameSet.deleteMany({ where: { sessionId: session.sessionId } });

    for (const set of sets) {
      const { setId } = await tx.gameSet.create({
        data: { sessionId: session.sessionId },
      });
      const setWinners = toRefs(set.setWinners);
      if (setWinners.length > 0)
        await tx.gameSet.update({
          where: { setId },
          data: { setWinners: { connect: setWinners } },
        });
      await createMatchesOf(set, setId);
    }
  }

  if (stats.length > 0) await tx.playerStat.createMany({ data: stats });

  // An edit rebuilt this session's matches, so vision flags that locate their
  // match by position may now be stale. New sessions save their flags after this.
  if (replacingSetIds) await reconcileVisionFlags(tx, session.sessionId);
}
