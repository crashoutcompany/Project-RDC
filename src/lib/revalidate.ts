import { revalidateTag } from "next/cache";

/** Cache tag for the aggregated arena stats (`getArenas` in rdc-stats). */
export const ARENAS_TAG = "getArenas";

/** Invalidate every cached view built from session data (game pages, member profiles, arena stats). */
export function revalidateSessionData() {
  revalidateTag("getAllSessions", "max");
  revalidateTag("getMember", "max");
  revalidateTag(ARENAS_TAG, "max");
}
