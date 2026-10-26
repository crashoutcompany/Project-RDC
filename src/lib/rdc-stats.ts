import "server-only";
import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { getAllGames } from "prisma/lib/games";
import { getAllMembers } from "prisma/lib/members";
import { getAllSessionsByGame } from "prisma/lib/admin";
import { gameImages, GamesEnum } from "@/lib/constants";
import { getFighterArt, ROSTER_ORDER, type FighterArt } from "@/lib/fighters";
import { formatSessionDate } from "@/lib/utils";
import { ARENAS_TAG } from "@/lib/revalidate";
import type { Sessions } from "@/app/(routes)/(groups)/games/[slug]/_helpers/dashboard";

export type PlayerRecord = {
  /** Display name as stored on the player row (first seen). */
  name: string;
  matches: number;
  sets: number;
  days: number;
  /** Average finishing position from the game's `*_POS` stat, if tracked. */
  avgPos: number | null;
};

export type Arena = {
  slug: GamesEnum;
  name: string;
  image: string;
  /** 1-based position in the arena list. */
  index: number;
  sessions: number;
  matches: number;
  sets: number;
  lastPlayed: string | null;
  /** Display name of the arena's top match winner. */
  champion: string | null;
  /** Keyed by lowercase player name (the roster slug). */
  records: Record<string, PlayerRecord>;
};

export type Fighter = {
  playerId: number;
  name: string;
  slug: string;
  art: FighterArt;
  /** Match wins in the featured arena, or null when it has no data. */
  wins: number | null;
  /** wins / total matches in the featured arena. */
  winShare: number | null;
  /** HP-bar fill relative to the arena leader, 0..1. */
  hp: number;
};

export type SorryEntry = {
  fighter: Fighter;
  /** Average leaderboard rank across arenas the member has wins in. */
  avgRank: number | null;
  /** Bar fill, 1 = best. The emptiest bar is the sorriest. */
  fill: number;
};

const ARENA_ORDER = [
  GamesEnum.MarioKart8,
  GamesEnum.RocketLeague,
  GamesEnum.CallOfDuty,
  GamesEnum.LethalCompany,
  GamesEnum.SpeedRunners,
  GamesEnum.MarvelRivals,
];

/** The arena that drives home-page HP bars and the "latest champion". */
export const FEATURED_ARENA = GamesEnum.MarioKart8;

export const toSlug = (name: string) => name.replace(/\s/g, "").toLowerCase();

export const formatDate = (date: Date) => formatSessionDate(date);

/**
 * Folds sessions into per-player match/set/day wins and avg position.
 * `sessions` must already be approved: `getAllSessionsByGame` applies
 * `approvedSession`, and every nested set/match/stat hangs off that session.
 */
export function summarizeArena(
  slug: GamesEnum,
  name: string,
  sessions: Sessions,
): Omit<Arena, "index"> {
  const records: Record<string, PlayerRecord> = {};
  const positions: Record<
    string,
    { name: string; sum: number; count: number }
  > = {};
  const record = (player: string) =>
    (records[player.toLowerCase()] ??= {
      name: player,
      matches: 0,
      sets: 0,
      days: 0,
      avgPos: null,
    });

  let matches = 0;
  let sets = 0;
  let lastPlayed: Date | null = null;

  for (const session of sessions) {
    const date = new Date(session.date);
    if (!lastPlayed || date > lastPlayed) lastPlayed = date;
    for (const winner of session.dayWinners) record(winner.playerName).days++;

    for (const set of session.sets) {
      sets++;
      for (const winner of set.setWinners) record(winner.playerName).sets++;
      for (const match of set.matches) {
        matches++;
        for (const winner of match.matchWinners)
          record(winner.playerName).matches++;
        for (const playerSession of match.playerSessions)
          for (const stat of playerSession.playerStats) {
            if (!stat.gameStat.statName.endsWith("_POS")) continue;
            const value = Number(stat.value);
            if (!Number.isFinite(value) || value <= 0) continue;
            const key = stat.player.playerName.toLowerCase();
            positions[key] ??= {
              name: stat.player.playerName,
              sum: 0,
              count: 0,
            };
            positions[key].sum += value;
            positions[key].count++;
          }
      }
    }
  }

  for (const { name: player, sum, count } of Object.values(positions))
    record(player).avgPos = sum / count;

  const champion =
    Object.values(records)
      .filter((r) => r.matches > 0)
      .sort((a, b) => b.matches - a.matches)[0]?.name ?? null;

  return {
    slug,
    name,
    image: `/images/${gameImages[slug]}`,
    sessions: sessions.length,
    matches,
    sets,
    lastPlayed: lastPlayed ? formatDate(lastPlayed) : null,
    champion,
    records,
  };
}

/**
 * Every game in display order with its aggregated stats. The aggregate is
 * cached as one small entry (so Home and member pages don't re-read every
 * approved session on each load) and revalidated with `ARENAS_TAG` when a
 * session is approved or edited; React `cache` dedupes within a request.
 */
export const getArenas = cache(async (): Promise<Arena[]> => {
  "use cache";
  cacheLife("max");
  cacheTag(ARENAS_TAG, "getAllSessions", "getAllGames");
  const games = await getAllGames();
  if (!games.success || !games.data) return [];

  const arenas = await Promise.all(
    games.data.map(async (game) => {
      const slug = toSlug(game.gameName) as GamesEnum;
      const sessions = await getAllSessionsByGame(game.gameId);
      return summarizeArena(
        slug,
        game.gameName,
        sessions.success && sessions.data ? sessions.data : [],
      );
    }),
  );

  const rank = (slug: GamesEnum) => {
    const i = ARENA_ORDER.indexOf(slug);
    return i === -1 ? ARENA_ORDER.length : i;
  };
  return arenas
    .sort((a, b) => rank(a.slug) - rank(b.slug))
    .map((arena, i) => ({ ...arena, index: i + 1 }));
});

export const getRoster = cache(async (): Promise<Fighter[]> => {
  const [members, arenas] = await Promise.all([getAllMembers(), getArenas()]);
  if (!members.success || !members.data) return [];

  const featured = arenas.find((a) => a.slug === FEATURED_ARENA);
  const leaderWins = Math.max(
    0,
    ...Object.values(featured?.records ?? {}).map((r) => r.matches),
  );
  const order = (name: string) => {
    const i = ROSTER_ORDER.indexOf(name.toLowerCase());
    return i === -1 ? ROSTER_ORDER.length : i;
  };

  return [...members.data]
    .sort((a, b) => order(a.playerName) - order(b.playerName))
    .map((member) => {
      const slug = member.playerName.toLowerCase();
      const wins =
        featured && featured.matches > 0
          ? (featured.records[slug]?.matches ?? 0)
          : null;
      return {
        playerId: member.playerId,
        name: member.playerName,
        slug,
        art: getFighterArt(member.playerName),
        wins: wins || null,
        winShare: wins && featured ? wins / featured.matches : null,
        hp: wins && leaderWins ? wins / leaderWins : 0,
      };
    });
});

/** Top `count` players by match wins in an arena. `slug` is the lookup key. */
export function topFive(arena: Arena | undefined, count = 5) {
  if (!arena) return [];
  return Object.entries(arena.records)
    .filter(([, r]) => r.matches > 0)
    .sort(([, a], [, b]) => b.matches - a.matches)
    .slice(0, count)
    .map(([slug, r]) => ({ slug, player: r.name, wins: r.matches }));
}

/**
 * Sorry rank by player slug: #1 is the sorriest, i.e. the worst (highest)
 * average leaderboard rank. Members without any wins have no rank.
 */
export function sorryRanks(entries: SorryEntry[]): Map<string, number> {
  const ranked = entries
    .filter((e) => e.avgRank !== null)
    .sort((a, b) => b.avgRank! - a.avgRank!);
  return new Map(ranked.map((e, i) => [e.fighter.slug, i + 1]));
}

/**
 * Average leaderboard rank across every arena a member has a win in.
 * Members with no wins anywhere get an empty bar and a null rank.
 */
export function sorryScale(roster: Fighter[], arenas: Arena[]): SorryEntry[] {
  const ranks: Record<string, number[]> = {};
  let maxRank = 1;
  for (const arena of arenas) {
    const board = topFive(arena, Infinity);
    maxRank = Math.max(maxRank, board.length);
    board.forEach(({ slug }, i) => (ranks[slug] ??= []).push(i + 1));
  }

  return roster.map((fighter) => {
    const list = ranks[fighter.slug];
    if (!list?.length) return { fighter, avgRank: null, fill: 0 };
    const avgRank = list.reduce((a, b) => a + b, 0) / list.length;
    const fill = maxRank > 1 ? 1 - (avgRank - 1) / maxRank : 1;
    return { fighter, avgRank, fill };
  });
}

/** Kill/death ratio. Deaths are floored at 1 so a player with no deaths still gets a finite value. */
export const killDeathRatio = (kills: number, deaths: number) =>
  kills / Math.max(deaths, 1);

export type SorryRange = "all" | "30d" | "last10";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Keeps sessions inside a time window. `last10` is the 10 most recent by
 * date; `30d` is relative to `now`. Never mutates the input.
 */
export function filterSessions<T extends { date: Date | string }>(
  sessions: T[],
  range: SorryRange,
  now = new Date(),
): T[] {
  const time = (s: T) => new Date(s.date).getTime();
  if (range === "last10")
    return [...sessions].sort((a, b) => time(b) - time(a)).slice(0, 10);
  if (range === "30d") {
    const cutoff = now.getTime() - 30 * DAY_MS;
    return sessions.filter((s) => time(s) >= cutoff);
  }
  return sessions;
}

/**
 * Pure core of `getSorryBoards`: windows the sessions, summarizes each game's
 * remainder as an arena, then scores the roster with the usual sorry scale.
 * `last10` takes the 10 most recent sessions across every feed, so in the
 * all-games view a game nobody has played lately drops out.
 */
export function sorryScaleFor(
  roster: Fighter[],
  feeds: { slug: GamesEnum; name: string; sessions: Sessions }[],
  range: SorryRange,
  now = new Date(),
): SorryEntry[] {
  const kept = new Set(
    filterSessions(
      feeds.flatMap((f) => f.sessions),
      range,
      now,
    ),
  );
  const arenas = feeds.map((feed, i) => ({
    ...summarizeArena(
      feed.slug,
      feed.name,
      feed.sessions.filter((s) => kept.has(s)),
    ),
    index: i + 1,
  }));
  return sorryScale(roster, arenas);
}

const SORRY_RANGES: SorryRange[] = ["all", "30d", "last10"];

/** One sorry-scale row without the fighter, keyed by roster slug. */
export type SorryScore = Pick<SorryEntry, "avgRank" | "fill"> & {
  slug: string;
};

export type SorryBoards = {
  games: { slug: GamesEnum; name: string }[];
  /** `boards[game][range]`, where `game` is a slug or `"all"`. */
  boards: Record<string, Record<SorryRange, SorryScore[]>>;
};

/**
 * Every game x range sorry scale, computed from one read of the approved
 * sessions so the filter tabs can switch on the client without a round trip.
 * Cached for hours rather than `max` because the 30-day window moves. Throws
 * when a query fails, so a transient DB error isn't cached as an empty board.
 */
export async function getSorryBoards(): Promise<SorryBoards> {
  "use cache";
  cacheLife("hours");
  cacheTag(ARENAS_TAG, "getAllSessions", "getAllGames");
  const [roster, arenas, games] = await Promise.all([
    getRoster(),
    getArenas(),
    getAllGames(),
  ]);
  const ordered = arenas.map(({ slug, name }) => ({ slug, name }));
  if (!games.success || !games.data)
    throw new Error("Sorry boards: failed to load games");

  const bySlug = new Map(games.data.map((g) => [toSlug(g.gameName), g]));
  const feeds = await Promise.all(
    ordered.flatMap(({ slug, name }) => {
      const game = bySlug.get(slug);
      if (!game) return [];
      return getAllSessionsByGame(game.gameId).then((sessions) => {
        if (!sessions.success || !sessions.data)
          throw new Error(`Sorry boards: failed to load ${name} sessions`);
        return { slug, name, sessions: sessions.data };
      });
    }),
  );

  const now = new Date();
  const boards: SorryBoards["boards"] = {};
  for (const game of ["all", ...ordered.map((g) => g.slug)]) {
    const scope = feeds.filter((f) => game === "all" || f.slug === game);
    boards[game] = Object.fromEntries(
      SORRY_RANGES.map((range) => [
        range,
        sorryScaleFor(roster, scope, range, now).map(
          ({ fighter, avgRank, fill }) => ({
            slug: fighter.slug,
            avgRank,
            fill,
          }),
        ),
      ]),
    ) as Record<SorryRange, SorryScore[]>;
  }
  return { games: ordered, boards };
}
