import { PLAYER_NAME_FIELD, type VisionPlayer } from "@/lib/visionTypes";
import type { Match, VisionFlag } from "./form-helpers";

/**
 * The import's low-confidence fields, with the value each one was imported
 * as. Rows not tied to a player can't be saved, so they carry no flags.
 */
function visionFlagsOf(players: VisionPlayer[]): VisionFlag[] {
  return players.flatMap((player) =>
    player.playerId
      ? (player.lowConfidence ?? []).map(({ field, confidence }) => ({
          playerId: player.playerId as number,
          field,
          value:
            field === PLAYER_NAME_FIELD
              ? player.name
              : (player.stats.find((stat) => stat.stat === field)?.statValue ??
                ""),
          confidence,
        }))
      : [],
  );
}

/**
 * A scoreboard import as a match for the session form. A row the import
 * could not tie to a player keeps id 0, which the form then rejects as not a
 * session player rather than saving it under someone else.
 */
export function visionResultToMatch(
  players: VisionPlayer[],
  winners: VisionPlayer[] = [],
): Match {
  const visionFlags = visionFlagsOf(players);
  return {
    ...(visionFlags.length > 0 && { visionFlags }),
    matchWinners: winners.map((player) => ({
      playerId: player.playerId || 0,
      playerName: player.name,
    })),
    playerSessions: players.map((player) => ({
      playerId: player.playerId || 0,
      playerSessionName: player.name || "Unknown Player",
      playerStats: player.stats.map(({ statId, stat, statValue }) => ({
        statId,
        stat,
        statValue,
      })) as Match["playerSessions"][number]["playerStats"],
    })),
  };
}
