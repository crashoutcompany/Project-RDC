import {
  isLowerBetter,
  STAT_CONFIGS,
  statRollup,
  type StatConfig,
} from "./stat-configs";
import type { MatchRow } from "./member-profile";

/** Minimal session shape: `getAllSessionsByGame` rows satisfy it. */
export type StreakSession = {
  sessionId: number;
  sessionName: string;
  date: Date;
  dayWinners: { playerName: string }[];
};

export type RecordSession = StreakSession & {
  sets: {
    matches: {
      matchWinners: { playerName: string }[];
      playerSessions: {
        playerStats: {
          value: string;
          player: { playerName: string };
          gameStat: { statName: string };
        }[];
      }[];
    }[];
  }[];
};

export type DayWinStreak = {
  player: string;
  longest: { length: number; from: Date; to: Date };
  /** Length of the run ending at the most recent recorded session, 0 if broken. */
  current: number;
};

export type GameRecord = {
  /** `MATCH_WINS` for match wins in a session, otherwise the StatName. */
  statName: string;
  label: string;
  /** "average" for stats rolled up as an average, otherwise a session total. */
  kind: "total" | "average";
  player: string;
  value: number;
  sessionId: number;
  sessionName: string;
  date: Date;
};

/** A player's matches in one approved session. */
export type SessionLine = {
  sessionId: number;
  sessionName: string;
  date: Date;
  matches: number;
  wins: number;
};

export type Prime = {
  from: SessionLine;
  to: SessionLine;
  sessions: number;
  matches: number;
  wins: number;
  rate: number;
};

export const MATCH_WINS = "MATCH_WINS";

const CONFIG_BY_NAME = new Map<string, StatConfig>(
  Object.values(STAT_CONFIGS).map((c) => [c.name, c]),
);

/**
 * Day-win streaks per player. Only sessions with recorded day winners count:
 * a session with no day winners is skipped, so it neither extends nor breaks
 * a streak. Any recorded session without the player breaks their run.
 *
 * @returns One entry per player who has ever won a day, longest streak first.
 */
export function dayWinStreaks(sessions: StreakSession[]): DayWinStreak[] {
  const recorded = sessions
    .filter((s) => s.dayWinners.length > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const lastIndex = recorded.length - 1;

  const state = new Map<
    string,
    {
      run: number;
      start: Date;
      last: number;
      longest: DayWinStreak["longest"] | null;
    }
  >();

  recorded.forEach((session, index) => {
    const winners = new Set(session.dayWinners.map((w) => w.playerName));
    for (const player of winners) {
      let st = state.get(player);
      if (!st) {
        st = { run: 0, start: session.date, last: -1, longest: null };
        state.set(player, st);
      }
      if (st.last === index - 1) st.run++;
      else {
        st.run = 1;
        st.start = session.date;
      }
      st.last = index;
      if (!st.longest || st.run > st.longest.length)
        st.longest = { length: st.run, from: st.start, to: session.date };
    }
  });

  return [...state]
    .flatMap(([player, st]) =>
      st.longest
        ? [
            {
              player,
              longest: st.longest,
              current: st.last === lastIndex ? st.run : 0,
            },
          ]
        : [],
    )
    .sort(
      (a, b) =>
        b.longest.length - a.longest.length ||
        a.longest.from.getTime() - b.longest.from.getTime() ||
        a.player.localeCompare(b.player),
    );
}

type Holder = { player: string; value: number };

/** Whether a candidate record should replace the current holder. */
const beats = (
  holder: Holder,
  session: StreakSession,
  current: GameRecord,
  lowerIsBetter: boolean,
) => {
  if (holder.value !== current.value)
    return lowerIsBetter
      ? holder.value < current.value
      : holder.value > current.value;
  return (
    (session.date.getTime() - current.date.getTime() ||
      session.sessionId - current.sessionId ||
      holder.player.localeCompare(current.player)) < 0
  );
};

/**
 * Stats that can be a "best in a session" record: anything with a rollup other
 * than "skip" (Days Played), and not lower-is-better counts such as deaths.
 * Position stats are lower-is-better but still ranked.
 */
const rankedConfig = (statName: string): StatConfig | undefined => {
  const config = CONFIG_BY_NAME.get(statName);
  if (!config || statRollup(config) === "skip") return undefined;
  if (isLowerBetter(config) && config.dataType !== "position") return undefined;
  return config;
};

/**
 * Best single-session record per ranked stat and for match wins. A player's
 * value in a session is their total for "sum" stats and their mean for
 * "average" stats (so accuracy stays within 0-100). Lower is better where
 * `isLowerBetter` says so. Ties go to the earlier session, then to the player
 * name ascending, so the result does not depend on input order. Blank and
 * non-numeric values are ignored.
 *
 * @returns Records in stat config order, match wins first; stats nobody has a value for are omitted.
 */
export function gameRecords(sessions: RecordSession[]): GameRecord[] {
  const best = new Map<string, GameRecord>();

  const offer = (
    statName: string,
    lowerIsBetter: boolean,
    kind: GameRecord["kind"],
    session: StreakSession,
    holder: Holder,
  ) => {
    const current = best.get(statName);
    if (current && !beats(holder, session, current, lowerIsBetter)) return;
    best.set(statName, {
      statName,
      label: CONFIG_BY_NAME.get(statName)?.displayName ?? "Match wins",
      kind,
      player: holder.player,
      value: holder.value,
      sessionId: session.sessionId,
      sessionName: session.sessionName,
      date: session.date,
    });
  };

  for (const session of sessions) {
    const wins = new Map<string, number>();
    const stats = new Map<
      string,
      Map<string, { sum: number; count: number }>
    >();

    for (const set of session.sets)
      for (const match of set.matches) {
        for (const w of match.matchWinners)
          wins.set(w.playerName, (wins.get(w.playerName) ?? 0) + 1);

        for (const ps of match.playerSessions)
          for (const st of ps.playerStats) {
            const statName = st.gameStat.statName;
            if (!rankedConfig(statName)) continue;
            const n = Number(st.value);
            if (st.value.trim() === "" || Number.isNaN(n)) continue;
            let byPlayer = stats.get(statName);
            if (!byPlayer) stats.set(statName, (byPlayer = new Map()));
            const player = st.player.playerName;
            const acc = byPlayer.get(player) ?? { sum: 0, count: 0 };
            acc.sum += n;
            acc.count++;
            byPlayer.set(player, acc);
          }
      }

    for (const [player, count] of wins)
      offer(MATCH_WINS, false, "total", session, { player, value: count });

    for (const [statName, byPlayer] of stats) {
      const config = rankedConfig(statName)!;
      const average = statRollup(config) === "average";
      for (const [player, acc] of byPlayer)
        offer(
          statName,
          isLowerBetter(config),
          average ? "average" : "total",
          session,
          { player, value: average ? acc.sum / acc.count : acc.sum },
        );
    }
  }

  const order = (statName: string) =>
    statName === MATCH_WINS ? 0 : CONFIG_BY_NAME.get(statName)!.id;
  return [...best.values()].sort(
    (a, b) => order(a.statName) - order(b.statName),
  );
}

/**
 * Best run of `n` consecutive sessions for one player in one game, ranked by
 * match win rate. Ties go to the most recent run.
 *
 * @returns The best window, or null if the player has fewer than `n` sessions.
 */
export function primeWindow(lines: SessionLine[], n = 5): Prime | null {
  const sorted = lines
    .filter((l) => l.matches > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let best: Prime | null = null;
  for (let i = 0; i + n <= sorted.length; i++) {
    const window = sorted.slice(i, i + n);
    const wins = window.reduce((sum, l) => sum + l.wins, 0);
    const matches = window.reduce((sum, l) => sum + l.matches, 0);
    const rate = wins / matches;
    const to = window[n - 1];
    if (
      !best ||
      rate > best.rate ||
      (rate === best.rate && to.date.getTime() > best.to.date.getTime())
    )
      best = { from: window[0], to, sessions: n, matches, wins, rate };
  }
  return best;
}

/**
 * Splits a player's matches (played and won) into per-game session lines and
 * returns each game's prime window. A match counts once even when it appears
 * in both lists. Games with fewer than `n` sessions are omitted.
 *
 * @returns One prime per game, sorted by game name.
 */
export function primesByGame(
  played: MatchRow[],
  wins: MatchRow[],
  n = 5,
): { gameName: string; prime: Prime }[] {
  type Acc = { line: SessionLine; matchIds: Set<number>; winIds: Set<number> };
  const games = new Map<string, Map<number, Acc>>();

  const add = (row: MatchRow, won: boolean) => {
    const { session } = row.set;
    const gameName = session.Game.gameName;
    let sessions = games.get(gameName);
    if (!sessions) games.set(gameName, (sessions = new Map()));
    let acc = sessions.get(session.sessionId);
    if (!acc) {
      acc = {
        line: {
          sessionId: session.sessionId,
          sessionName: session.sessionName,
          date: session.date,
          matches: 0,
          wins: 0,
        },
        matchIds: new Set(),
        winIds: new Set(),
      };
      sessions.set(session.sessionId, acc);
    }
    acc.matchIds.add(row.matchId);
    if (won) acc.winIds.add(row.matchId);
  };

  for (const row of played) add(row, false);
  for (const row of wins) add(row, true);

  return [...games.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([gameName, sessions]) => {
      const lines = [...sessions.values()].map(
        ({ line, matchIds, winIds }) => ({
          ...line,
          matches: matchIds.size,
          wins: winIds.size,
        }),
      );
      const prime = primeWindow(lines, n);
      return prime ? [{ gameName, prime }] : [];
    });
}
