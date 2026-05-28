import { GameProfile } from "./types";
import { rocketLeague } from "./rocket-league";

/**
 * Central registry of all supported games. Add a new game by importing its
 * profile and appending it to GAME_PROFILES. The CLI's --game flag, the
 * output directory layout, and the reference-image lookup all read from here.
 */
export const GAME_PROFILES: readonly GameProfile[] = [rocketLeague];

const PROFILES_BY_ID = new Map<string, GameProfile>(
  GAME_PROFILES.map((p) => [p.id, p]),
);

/** Default game when --game is omitted (back-compat with the RL-only era). */
export const DEFAULT_GAME_ID = "rocket-league";

/**
 * Looks up a game profile by ID. Throws with a list of valid IDs if the ID
 * doesn't match a registered game — the caller is expected to surface this
 * to the user (we don't exit here so this stays a pure function).
 *
 * @param id - Slug like "rocket-league".
 * @returns The matching GameProfile.
 */
export function resolveProfile(id: string): GameProfile {
  const profile = PROFILES_BY_ID.get(id);
  if (!profile) {
    const valid = [...PROFILES_BY_ID.keys()].join(", ");
    throw new Error(
      `Unknown game "${id}". Available games: ${valid}`,
    );
  }
  return profile;
}

/** Returns the list of registered game IDs. */
export function listGameIds(): string[] {
  return [...PROFILES_BY_ID.keys()];
}
