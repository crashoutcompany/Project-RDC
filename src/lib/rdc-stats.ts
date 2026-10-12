import "server-only";
import { cache } from "react";
import { getAllGames } from "prisma/lib/games";
import { getAllMembers } from "prisma/lib/members";
import { getAllSessionsByGame } from "prisma/lib/admin";
import { gameImages, GamesEnum } from "@/lib/constants";
import { getFighterArt, ROSTER_ORDER, type FighterArt } from "@/lib/fighters";
import type { Sessions } from "@/app/(routes)/(groups)/games/[slug]/_helpers/dashboard";

export type PlayerRecord = {
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
  /** Player with the most match wins, or null. `slug` is the `records` key. */
  champion: { name: string; slug: string } | null;
  /** Keyed by lowercase player name. */
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

export const formatDate = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });

/**
 * Folds sessions into per-player match/set/day wins and avg position. Callers
 * pass only approved sessions: `getAllSessionsByGame` filters on `isApproved`.
 */
export function summarizeArena(
  slug: GamesEnum,
  name: string,
  sessions: Sessions,
): Omit<Arena, "index"> {
  const records: Record<string, PlayerRecord> = {};
  /** Display name per lowercase key, from the first spelling seen. */
  const names: Record<string, string> = {};
  const positions: Record<string, { name: string; sum: number; count: number }> = {};
  const record = (player: string) => {
    const key = player.toLowerCase();
    names[key] ??= player;
    return (records[key] ??= {
      matches: 0,
      sets: 0,
      days: 0,
      avgPos: null,
    });
  };

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
            positions[key] ??= { name: stat.player.playerName, sum: 0, count: 0 };
            positions[key].sum += value;
            positions[key].count++;
          }
      }
    }
  }

  for (const { name: player, sum, count } of Object.values(positions))
    record(player).avgPos = sum / count;

  const championKey =
    Object.entries(records)
      .filter(([, r]) => r.matches > 0)
      .sort(([, a], [, b]) => b.matches - a.matches)[0]?.[0];
  const champion = championKey
    ? { name: names[championKey], slug: championKey }
    : null;

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

/** Every game in display order with its aggregated stats. Deduped per request. */
export const getArenas = cache(async (): Promise<Arena[]> => {
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

/** Top `count` players by match wins in an arena. */
export function topFive(arena: Arena | undefined, count = 5) {
  if (!arena) return [];
  return Object.entries(arena.records)
    .filter(([, r]) => r.matches > 0)
    .sort(([, a], [, b]) => b.matches - a.matches)
    .slice(0, count)
    .map(([player, r]) => ({ player, wins: r.matches }));
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
    board.forEach(({ player }, i) => (ranks[player] ??= []).push(i + 1));
  }

  return roster.map((fighter) => {
    const list = ranks[fighter.slug];
    if (!list?.length) return { fighter, avgRank: null, fill: 0 };
    const avgRank = list.reduce((a, b) => a + b, 0) / list.length;
    const fill = maxRank > 1 ? 1 - (avgRank - 1) / maxRank : 1;
    return { fighter, avgRank, fill };
  });
}

export const percent = (share: number | null) =>
  share === null ? "--" : `${Math.round(share * 100)}%`;
