import type { VisionPlayer } from "@/lib/visionTypes";
import type { Match } from "./form-helpers";

/**
 * A scoreboard import as a match for the session form. A row the import
 * could not tie to a player keeps id 0, which the form then rejects as not a
 * session player rather than saving it under someone else.
 */
export function visionResultToMatch(
  players: VisionPlayer[],
  winners: VisionPlayer[] = [],
): Match {
  return {
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
