import { PLAYER_NAME_FIELD } from "@/lib/visionTypes";
import type { VisionFlag } from "@/app/(routes)/admin/_utils/form-helpers";

type FlaggedMatch = {
  visionFlags?: VisionFlag[];
  playerSessions: {
    playerId: number;
    playerStats: { stat: string; statValue: string }[];
  }[];
};

/** A flag as saved for the review queue, located by set and match position. */
export type ImportFlagRow = {
  setIndex: number;
  matchIndex: number;
  playerId: number;
  field: string;
  readValue: string;
  confidence: number;
};

/** "007" and "7" are the same stat; the form stores the canonical string. */
export const normalizeFlagValue = (value: string) => {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? String(parseInt(trimmed, 10)) : trimmed;
};

/**
 * The low-confidence fields of a submitted session that still need a look.
 * A flag is dropped when the admin already changed that field in the form
 * (the stat no longer holds the imported value, or the player was removed
 * from the match), so nobody is asked to review a value that isn't saved.
 */
export function collectImportFlags(
  sets: { matches: FlaggedMatch[] }[],
): ImportFlagRow[] {
  const rows: ImportFlagRow[] = [];
  const seen = new Set<string>();

  sets.forEach((set, setIndex) =>
    set.matches.forEach((match, matchIndex) => {
      if (!match.visionFlags?.length) return;
      // Each player's stat values in this match, by stat name.
      const statsByPlayer = new Map(
        match.playerSessions.map((ps) => [
          ps.playerId,
          new Map(ps.playerStats.map((s) => [s.stat, s.statValue])),
        ]),
      );

      for (const flag of match.visionFlags) {
        const stats = statsByPlayer.get(flag.playerId);
        if (!stats) continue;

        if (flag.field !== PLAYER_NAME_FIELD) {
          const statValue = stats.get(flag.field);
          if (
            statValue === undefined ||
            normalizeFlagValue(statValue) !== normalizeFlagValue(flag.value)
          )
            continue;
        }

        const key = `${setIndex}:${matchIndex}:${flag.playerId}:${flag.field}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          setIndex,
          matchIndex,
          playerId: flag.playerId,
          field: flag.field,
          readValue: normalizeFlagValue(flag.value),
          confidence: flag.confidence,
        });
      }
    }),
  );
  return rows;
}

/**
 * True while the flagged spot still holds what vision read: for a stat, the
 * player's stat there still has `readValue`; for a name, the player is still
 * in that match. `stats` is the player's stats at the flag's position, or
 * undefined when the player isn't there. A flag that fails this was changed
 * by an edit (or now points at a different match after sets or matches were
 * added or removed), so it must not be written through.
 */
export function stillHoldsRead(
  flag: { field: string; readValue: string },
  stats: { statName: string; value: string }[] | undefined,
): boolean {
  if (!stats) return false;
  if (flag.field === PLAYER_NAME_FIELD) return true;
  const stat = stats.find((s) => s.statName === flag.field);
  return (
    stat !== undefined &&
    normalizeFlagValue(stat.value) === normalizeFlagValue(flag.readValue)
  );
}
