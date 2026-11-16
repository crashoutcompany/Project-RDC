import type { getWinsPerPlayer } from "prisma/lib/games";
import type { QueryResponseData } from "prisma/db";

type Wins = { matchWins: number; setWins: number; days: number };

/**
 * Counts each player's match, set and day wins across a game's sessions, in
 * the row shape the wins chart reads (`days` is the chart's "Days won" tab).
 */
export const calcWinsPerPlayer = (
  game: QueryResponseData<Awaited<ReturnType<typeof getWinsPerPlayer>>>,
) => {
  const members = new Map<string, Wins>();
  const count = (winners: { playerName: string }[], kind: keyof Wins) => {
    for (const { playerName } of winners) {
      const wins = members.get(playerName) ?? {
        matchWins: 0,
        setWins: 0,
        days: 0,
      };
      wins[kind] += 1;
      members.set(playerName, wins);
    }
  };

  for (const session of game.sessions) {
    for (const set of session.sets) {
      for (const match of set.matches) count(match.matchWinners, "matchWins");
      count(set.setWinners, "setWins");
    }
    count(session.dayWinners, "days");
  }

  return Array.from(members, ([player, wins]) => ({ player, ...wins }));
};
