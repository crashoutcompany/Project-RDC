import { QueryResponseData } from "prisma/db";
import { getAllSessionsByGame } from "prisma/lib/admin";
import { findPlayer } from "@/app/(routes)/admin/_utils/player-mappings";
import { MvpOutput, mvpStatsSchema } from "@/app/ai/types";

export type Sessions = QueryResponseData<
  Awaited<ReturnType<typeof getAllSessionsByGame>>
>;

export type DashboardBannerStats = {
  totalMatches: number;
  totalSets: number;
  lastPlayed: string | null;
};

export type LeaderboardEntry = {
  player: string;
  matchWins: number;
  setWins: number;
};

export type MvpProfile = {
  playerName: string;
  image: string;
  description: string | null;
  stats: { statName: string; sum: number | string; average?: number | string }[];
} | null;

export type RecentMatchData = {
  sessionName: string;
  thumbnail: string;
  sessionUrl: string;
  date: string;
  gameName: string;
  placements: { place: number; playerName: string; points: number }[];
};

export type GameDashboardData = {
  gameName: string;
  gameSlug: string;
  gameImage: string;
  bannerStats: DashboardBannerStats;
  mvpProfile: MvpProfile;
  leaderboard: LeaderboardEntry[];
  sessions: Sessions;
  recentMatches: RecentMatchData[];
};

/**
 * Computes banner stats (total matches, total sets, last played) from session data.
 *
 * @param sessions - Array of session data from the database.
 * @returns An object with totalMatches, totalSets, and lastPlayed date string.
 */
export function computeBannerStats(sessions: Sessions): DashboardBannerStats {
  let totalMatches = 0;
  let totalSets = 0;
  let lastPlayed: Date | null = null;

  for (const session of sessions) {
    const sessionDate = new Date(session.date);
    if (!lastPlayed || sessionDate > lastPlayed) lastPlayed = sessionDate;

    totalSets += session.sets.length;
    for (const set of session.sets) totalMatches += set.matches.length;
  }

  return {
    totalMatches,
    totalSets,
    lastPlayed: lastPlayed
      ? lastPlayed.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null,
  };
}

/**
 * Computes the leaderboard by counting match wins per player across all sessions.
 *
 * @param sessions - Array of session data from the database.
 * @returns Sorted array of leaderboard entries (highest match wins first).
 */
export function computeLeaderboard(sessions: Sessions): LeaderboardEntry[] {
  const members = new Map<string, { matchWins: number; setWins: number }>();

  for (const session of sessions) {
    for (const set of session.sets) {
      for (const match of set.matches) {
        for (const winner of match.matchWinners) {
          const entry = members.get(winner.playerName);
          if (!entry)
            members.set(winner.playerName, { matchWins: 1, setWins: 0 });
          else entry.matchWins += 1;
        }
      }
      for (const winner of set.setWinners) {
        const entry = members.get(winner.playerName);
        if (!entry)
          members.set(winner.playerName, { matchWins: 0, setWins: 1 });
        else entry.setWins += 1;
      }
    }
  }

  return Array.from(members, ([player, data]) => ({
    player,
    ...data,
  })).sort((a, b) => b.matchWins - a.matchWins);
}

/**
 * Extracts the most recent MVP profile from session data.
 *
 * @param sessions - Array of session data from the database.
 * @returns The MVP profile or null if no MVP exists.
 */
export function extractMvpProfile(sessions: Sessions): MvpProfile {
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  for (const session of sortedSessions) {
    if (session.mvp && session.mvpDescription) {
      const parsed = mvpStatsSchema.safeParse(session.mvpStats);
      const playerMapping = findPlayer(session.mvp.playerName);

      return {
        playerName: session.mvp.playerName,
        image: playerMapping?.image || "",
        description: session.mvpDescription,
        stats: parsed.success
          ? (session.mvpStats as MvpOutput["stats"])
          : [],
      };
    }
  }

  return null;
}

/**
 * Computes the last N sessions' match data for the "Recent Matches" section.
 * For each session, calculates top placements by counting match wins per player.
 *
 * @param sessions - Array of session data from the database.
 * @param count - Number of recent sessions to return.
 * @returns Array of recent match data with placements.
 */
export function computeRecentMatches(
  sessions: Sessions,
  count = 2,
): RecentMatchData[] {
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const recent = sorted.slice(0, count);

  return recent.map((session) => {
    const playerWins = new Map<string, number>();

    for (const set of session.sets) {
      for (const match of set.matches) {
        for (const winner of match.matchWinners) {
          playerWins.set(
            winner.playerName,
            (playerWins.get(winner.playerName) || 0) + 1,
          );
        }
      }
    }

    const placements = Array.from(playerWins, ([name, wins]) => ({
      playerName: name,
      points: wins,
    }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map((entry, index) => ({
        place: index + 1,
        playerName: entry.playerName,
        points: entry.points,
      }));

    return {
      sessionName: session.sessionName,
      thumbnail: session.thumbnail,
      sessionUrl: session.sessionUrl,
      date: new Date(session.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      gameName: session.Game.gameName,
      placements,
    };
  });
}

/**
 * Assembles all dashboard data from session data and game metadata.
 *
 * @param sessions - Array of session data from the database.
 * @param gameName - Display name of the game.
 * @param gameSlug - URL slug for the game.
 * @param gameImage - Path to game's banner image.
 * @returns Complete dashboard data object.
 */
export function assembleDashboardData(
  sessions: Sessions,
  gameName: string,
  gameSlug: string,
  gameImage: string,
): GameDashboardData {
  return {
    gameName,
    gameSlug,
    gameImage,
    bannerStats: computeBannerStats(sessions),
    mvpProfile: extractMvpProfile(sessions),
    leaderboard: computeLeaderboard(sessions),
    sessions,
    recentMatches: computeRecentMatches(sessions),
  };
}
