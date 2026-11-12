"use server";

import { getAllGames } from "prisma/lib/games";

/**
 * Thin server action so client components can read the approved games list
 * (public data) now that `prisma/lib/games.ts` is no longer a "use server" module.
 */
export async function getAllGamesAction() {
  return await getAllGames();
}
