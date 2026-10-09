import { revalidateTag } from "next/cache";

/** Invalidate every cached view built from session data (game pages + member profiles). */
export function revalidateSessionData() {
  revalidateTag("getAllSessions", "max");
  revalidateTag("getMember", "max");
}
