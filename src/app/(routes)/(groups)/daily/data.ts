import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getArenas, getRoster } from "@/lib/rdc-stats";
import { ARENAS_TAG } from "@/lib/revalidate";
import { buildCandidates, selectPuzzle, type DailyPuzzle } from "@/lib/daily";

/**
 * The puzzle for one day, cached per `dayKey` so page loads don't rebuild it.
 * Tagged with `ARENAS_TAG` so an approved session refreshes the numbers;
 * `selectPuzzle` keeps the question itself stable across that refresh.
 */
export async function getDailyPuzzle(
  dayKey: string,
): Promise<DailyPuzzle | null> {
  "use cache";
  cacheLife("days");
  cacheTag(ARENAS_TAG, `daily-${dayKey}`);
  const [arenas, roster] = await Promise.all([getArenas(), getRoster()]);
  const members = roster.map(({ slug, name }) => ({ slug, name }));
  return selectPuzzle(dayKey, buildCandidates(arenas, members));
}
