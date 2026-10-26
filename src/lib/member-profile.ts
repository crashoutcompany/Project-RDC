import { STAT_CONFIGS, statRollup, type StatConfig } from "./stat-configs";

export type SessionRef = {
  sessionId: number;
  sessionName: string;
  date: Date;
  Game: { gameName: string };
};

export type StatRow = {
  value: string;
  game: { gameName: string };
  gameStat: { statName: string };
};

/** A match row joined to the approved session it was played in. */
export type MatchRow = { matchId: number; set: { session: SessionRef } };

export type StatKind = "average" | "total" | "perMatch" | "count";

export type StatLine = {
  statName: string;
  displayName: string;
  value: number;
  kind: StatKind;
};

export type GameBreakdown = {
  gameName: string;
  gameSlug: string;
  stats: StatLine[];
};

export type TrendPoint = {
  month: string;
  matches: number;
  wins: number;
  winRate: number;
};

export type BestSession = {
  sessionId: number;
  sessionName: string;
  gameName: string;
  date: Date;
  wins: number;
  matches: number;
  rate: number;
};

const CONFIG_BY_NAME = new Map<string, StatConfig>(
  Object.values(STAT_CONFIGS).map((c) => [c.name, c]),
);

export const gameSlug = (gameName: string) =>
  gameName.replace(/\s/g, "").toLowerCase();

const toNumber = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? NaN : Number(trimmed);
};

type Acc = { config: StatConfig; sum: number; count: number; hits: number };

/**
 * Per-game stat lines, rolled up by `statRollup`: "sum" gives a total and a
 * per-match average, "average" gives the mean of per-match values, "skip"
 * omits the stat. Booleans count `true` values. Games with no lines are
 * dropped. Stats missing from STAT_CONFIGS and unparseable numbers are skipped.
 */
export function statBreakdown(rows: StatRow[]): GameBreakdown[] {
  const byGame = new Map<string, Map<string, Acc>>();

  for (const row of rows) {
    const config = CONFIG_BY_NAME.get(row.gameStat.statName);
    if (!config || statRollup(config) === "skip") continue;

    const gameName = row.game.gameName;
    let stats = byGame.get(gameName);
    if (!stats) byGame.set(gameName, (stats = new Map()));
    let acc = stats.get(config.name);
    if (!acc)
      stats.set(config.name, (acc = { config, sum: 0, count: 0, hits: 0 }));

    if (config.dataType === "boolean") {
      if (row.value.trim().toLowerCase() === "true") acc.hits++;
      continue;
    }
    const n = toNumber(row.value);
    if (Number.isNaN(n)) continue;
    acc.sum += n;
    acc.count++;
  }

  return [...byGame.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([gameName, stats]) => {
      const lines: { id: number; line: StatLine }[] = [];
      for (const { config, sum, count, hits } of stats.values()) {
        const base = { statName: config.name, displayName: config.displayName };
        if (config.dataType === "boolean")
          lines.push({
            id: config.id,
            line: { ...base, value: hits, kind: "count" },
          });
        else if (count === 0) continue;
        else if (statRollup(config) === "average")
          lines.push({
            id: config.id,
            line: { ...base, value: sum / count, kind: "average" },
          });
        else {
          lines.push({
            id: config.id,
            line: { ...base, value: sum, kind: "total" },
          });
          lines.push({
            id: config.id,
            line: { ...base, value: sum / count, kind: "perMatch" },
          });
        }
      }
      lines.sort((a, b) => a.id - b.id);
      return {
        gameName,
        gameSlug: gameSlug(gameName),
        stats: lines.map((l) => l.line),
      };
    })
    .filter((game) => game.stats.length > 0);
}

const monthKey = (date: Date) => date.toISOString().slice(0, 7);

/**
 * Monthly match win rate (UTC month of the session date). A match counts as
 * played if it appears in either list, so wins are never more than matches.
 */
export function trendByMonth(
  played: MatchRow[],
  wins: MatchRow[],
): TrendPoint[] {
  const matchesByMonth = new Map<string, Set<number>>();
  const winsByMonth = new Map<string, Set<number>>();
  const add = (map: Map<string, Set<number>>, row: MatchRow) => {
    const month = monthKey(row.set.session.date);
    const ids = map.get(month) ?? new Set<number>();
    ids.add(row.matchId);
    map.set(month, ids);
  };

  for (const row of played) add(matchesByMonth, row);
  for (const row of wins) {
    add(matchesByMonth, row);
    add(winsByMonth, row);
  }

  return [...matchesByMonth.keys()].sort().map((month) => {
    const matches = matchesByMonth.get(month)?.size ?? 0;
    const winCount = winsByMonth.get(month)?.size ?? 0;
    return {
      month,
      matches,
      wins: winCount,
      winRate: matches ? winCount / matches : 0,
    };
  });
}

/**
 * Sessions ranked by the member's match win rate (wins / matches played in the
 * session), so long sessions don't win on volume alone. Ties go to more wins,
 * then the most recent session. Only sessions with at least one win are kept.
 */
export function bestSessions(
  played: MatchRow[],
  wins: MatchRow[],
  n = 3,
): BestSession[] {
  type Entry = {
    session: SessionRef;
    matches: Set<number>;
    wins: Set<number>;
  };
  const bySession = new Map<number, Entry>();
  const entryFor = (session: SessionRef) => {
    let entry = bySession.get(session.sessionId);
    if (!entry)
      bySession.set(
        session.sessionId,
        (entry = { session, matches: new Set(), wins: new Set() }),
      );
    return entry;
  };

  for (const { matchId, set } of played)
    entryFor(set.session).matches.add(matchId);
  for (const { matchId, set } of wins) {
    const entry = entryFor(set.session);
    entry.matches.add(matchId);
    entry.wins.add(matchId);
  }

  return [...bySession.values()]
    .filter((entry) => entry.wins.size > 0)
    .map(({ session, matches, wins }) => ({
      sessionId: session.sessionId,
      sessionName: session.sessionName,
      gameName: session.Game.gameName,
      date: session.date,
      wins: wins.size,
      matches: matches.size,
      rate: wins.size / matches.size,
    }))
    .sort(
      (a, b) =>
        b.rate - a.rate ||
        b.wins - a.wins ||
        b.date.getTime() - a.date.getTime(),
    )
    .slice(0, n);
}
