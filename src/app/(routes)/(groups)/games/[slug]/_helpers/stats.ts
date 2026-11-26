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

export const RECENT_FORM_SESSIONS = 5;

export type RecentForm = {
  sessions: {
    sessionId: number;
    sessionName: string;
    date: Date;
    dayWinners: string[];
  }[];
  /** Days won across those sessions, most first. */
  daysWon: { player: string; days: number }[];
};

/**
 * The crew's form over the latest sessions: who won each day, newest first,
 * and a days-won tally for that window. Reads the same `dayWinners` as the
 * "Days won" tab.
 */
export const calcRecentForm = (
  game: QueryResponseData<Awaited<ReturnType<typeof getWinsPerPlayer>>>,
  count = RECENT_FORM_SESSIONS,
): RecentForm => {
  const sessions = [...game.sessions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, count)
    .map((session) => ({
      sessionId: session.sessionId,
      sessionName: session.sessionName,
      date: session.date,
      dayWinners: session.dayWinners.map((w) => w.playerName),
    }));

  const tally = new Map<string, number>();
  for (const { dayWinners } of sessions)
    for (const player of dayWinners) tally.set(player, (tally.get(player) ?? 0) + 1);

  const daysWon = Array.from(tally, ([player, days]) => ({ player, days })).sort(
    (a, b) => b.days - a.days,
  );

  return { sessions, daysWon };
};
