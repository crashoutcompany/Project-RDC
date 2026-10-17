import type { Sessions } from "@/app/(routes)/(groups)/games/[slug]/_helpers/dashboard";
import { STAT_CONFIGS, type StatConfig } from "./stat-configs";

type Session = Sessions[number];

export type BattleSide = { matches: number; sets: number; days: number };

export type BattleStat = {
  statName: string;
  displayName: string;
  /** Average per match, or null when that side has no value. */
  a: number | null;
  b: number | null;
  /** Position stats are lower-is-better; everything else is higher-is-better. */
  better: "a" | "b" | null;
};

export type BattleGame = {
  slug: string;
  name: string;
  /** Sessions in this game where both players took part. */
  shared: number;
  a: BattleSide;
  b: BattleSide;
  stats: BattleStat[];
};

export type BattleSession = {
  sessionId: number;
  sessionName: string;
  gameName: string;
  date: Date;
  dayWinners: string[];
};

export type HeadToHead = {
  shared: number;
  a: BattleSide;
  b: BattleSide;
  games: BattleGame[];
  /** Latest five shared sessions across all games, newest first. */
  recent: BattleSession[];
};

export type BattleFeed = { slug: string; name: string; sessions: Sessions };

const RECENT_COUNT = 5;
const CONFIG_BY_NAME = new Map<string, StatConfig>(
  Object.values(STAT_CONFIGS).map((config) => [config.name, config]),
);

type Average = { sum: number; count: number };

const emptySide = (): BattleSide => ({ matches: 0, sets: 0, days: 0 });

/**
 * Head-to-head record for two players (by `playerId`) across every game feed.
 * Only sessions where both appeared count, so a session one of them skipped
 * never adds to either side. A player "appeared" if they won something or
 * have a stat row in that session.
 */
export function headToHead(
  aId: number,
  bId: number,
  feeds: BattleFeed[],
): HeadToHead {
  const games: BattleGame[] = [];
  const recent: BattleSession[] = [];
  const totals = { shared: 0, a: emptySide(), b: emptySide() };

  for (const feed of feeds) {
    const shared = feed.sessions.filter((session) => {
      const ids = playerIdsIn(session);
      return ids.has(aId) && ids.has(bId);
    });
    if (shared.length === 0) continue;

    const game: BattleGame = {
      slug: feed.slug,
      name: feed.name,
      shared: shared.length,
      a: emptySide(),
      b: emptySide(),
      stats: [],
    };
    const aStats = new Map<string, Average>();
    const bStats = new Map<string, Average>();

    for (const session of shared) {
      addWins(game.a, session, aId);
      addWins(game.b, session, bId);
      collectStats(aStats, session, aId);
      collectStats(bStats, session, bId);
      recent.push({
        sessionId: session.sessionId,
        sessionName: session.sessionName,
        gameName: feed.name,
        date: new Date(session.date),
        dayWinners: session.dayWinners.map((w) => w.playerName),
      });
    }

    for (const config of Object.values(STAT_CONFIGS)) {
      const a = average(aStats.get(config.name));
      const b = average(bStats.get(config.name));
      if (a === null && b === null) continue;
      game.stats.push({
        statName: config.name,
        displayName: config.displayName,
        a,
        b,
        better: pickBetter(a, b, config.dataType === "position"),
      });
    }

    games.push(game);
    totals.shared += game.shared;
    addSide(totals.a, game.a);
    addSide(totals.b, game.b);
  }

  recent.sort((x, y) => y.date.getTime() - x.date.getTime());
  return { ...totals, games, recent: recent.slice(0, RECENT_COUNT) };
}

/** Ids of everyone with a win or a stat row in the session. */
function playerIdsIn(session: Session): Set<number> {
  const ids = new Set<number>();
  for (const w of session.dayWinners) ids.add(w.playerId);
  for (const set of session.sets) {
    for (const w of set.setWinners) ids.add(w.playerId);
    for (const match of set.matches) {
      for (const w of match.matchWinners) ids.add(w.playerId);
      for (const ps of match.playerSessions)
        for (const stat of ps.playerStats) ids.add(stat.player.playerId);
    }
  }
  return ids;
}

function addWins(side: BattleSide, session: Session, id: number) {
  side.days += session.dayWinners.filter((w) => w.playerId === id).length;
  for (const set of session.sets) {
    side.sets += set.setWinners.filter((w) => w.playerId === id).length;
    for (const match of set.matches)
      side.matches += match.matchWinners.filter(
        (w) => w.playerId === id,
      ).length;
  }
}

function addSide(into: BattleSide, from: BattleSide) {
  into.matches += from.matches;
  into.sets += from.sets;
  into.days += from.days;
}

/** Sums each known stat for one player across a session's matches. */
function collectStats(
  into: Map<string, Average>,
  session: Session,
  id: number,
) {
  for (const set of session.sets)
    for (const match of set.matches)
      for (const ps of match.playerSessions)
        for (const stat of ps.playerStats) {
          if (stat.player.playerId !== id) continue;
          const config = CONFIG_BY_NAME.get(stat.gameStat.statName);
          if (!config) continue;
          const value = Number(stat.value);
          if (!Number.isFinite(value)) continue;
          if (config.dataType === "position" && value <= 0) continue;
          const avg = into.get(config.name) ?? { sum: 0, count: 0 };
          avg.sum += value;
          avg.count++;
          into.set(config.name, avg);
        }
}

function average(avg: Average | undefined): number | null {
  if (!avg || avg.count === 0) return null;
  return avg.sum / avg.count;
}

function pickBetter(
  a: number | null,
  b: number | null,
  lowerIsBetter: boolean,
): "a" | "b" | null {
  if (a === null) return b === null ? null : "b";
  if (b === null) return "a";
  if (a === b) return null;
  return a < b === lowerIsBetter ? "a" : "b";
}
