import type { getSessionById } from "prisma/lib/session";
import type { QueryResponseData } from "prisma/db";
import type { GameName } from "@/lib/games";
import type { StatName } from "@/lib/stat-names";
import type { FormValues } from "./form-helpers";

type StoredSession = QueryResponseData<
  Awaited<ReturnType<typeof getSessionById>>
>;

const toPlayer = ({
  playerId,
  playerName,
}: {
  playerId: number;
  playerName: string;
}) => ({ playerId, playerName });

/**
 * A stored session in the shape the session form edits. The session's
 * players are everyone with a player session in any match, so a day winner
 * who sat out the first match still counts.
 *
 * The game and stat names come from the database as plain strings; the form
 * schema is what decides whether they are ones it accepts.
 */
export function sessionToFormValues(session: StoredSession): FormValues {
  const playersById = new Map<number, FormValues["players"][number]>();
  for (const set of session.sets)
    for (const match of set.matches)
      for (const { player } of match.playerSessions)
        playersById.set(player.playerId, toPlayer(player));

  return {
    sessionId: session.sessionId,
    game: session.Game.gameName as GameName,
    sessionName: session.sessionName,
    sessionUrl: session.sessionUrl,
    thumbnail: session.thumbnail,
    videoId: session.videoId,
    date: new Date(session.date),
    players: [...playersById.values()],
    dayWinners: session.dayWinners.map(toPlayer),
    sets: session.sets.map((set) => ({
      setId: set.setId,
      setWinners: set.setWinners.map(toPlayer),
      matches: set.matches.map((match) => ({
        matchWinners: match.matchWinners.map(toPlayer),
        playerSessions: match.playerSessions.map(({ player, playerStats }) => ({
          playerId: player.playerId,
          playerSessionName: player.playerName,
          playerStats: playerStats.map((stat) => ({
            statId: stat.gameStat.statId,
            stat: stat.gameStat.statName as StatName,
            statValue: stat.value,
          })),
        })),
      })),
    })),
  };
}
