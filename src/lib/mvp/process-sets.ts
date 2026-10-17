/**
 * Pure transforms from a session's sets into the per-match player summaries
 * the MVP model reads. Shared by the admin card (client) and the server-side
 * MVP generator, so this module must stay free of React and server-only imports.
 */

type GameSet = {
  setWinners: { playerName: string }[];
  matches: {
    matchWinners: { playerName: string }[];
    playerSessions: {
      playerStats: {
        player: { playerName: string };
        value: string;
        gameStat: { statName: string };
      }[];
    }[];
  }[];
};

type RLPlayerStats = {
  player: string;
  score: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
};

type MarioKartPlayerStats = {
  player: string;
  position: number;
};

type PlayerStats = RLPlayerStats | MarioKartPlayerStats;

type ProcessedMatch = {
  matchWinners: string[];
  players: PlayerStats[];
};

export type ProcessedSet = {
  setWinners: string[];
  matches: ProcessedMatch[];
};

/** The subset of a session (from either query shape) that the processors read. */
export type SessionForSets = {
  Game: { gameName: string };
  sets?: GameSet[] | null;
};

const processRocketLeagueData = (sets: GameSet[]): ProcessedSet[] => {
  const processedSets: ProcessedSet[] = sets.map((set) => {
    const setWinners = set.setWinners.map((p) => p.playerName);

    const matches: ProcessedMatch[] = set.matches.map((match) => {
      const matchWinners = match.matchWinners.map((m) => m.playerName);
      const matchWinnersSet = new Set(matchWinners);

      const playerStatsMap = new Map<string, Omit<RLPlayerStats, "player">>();

      match.playerSessions.forEach((ps) => {
        ps.playerStats.forEach(({ player, value, gameStat }) => {
          if (!playerStatsMap.has(player.playerName)) {
            playerStatsMap.set(player.playerName, {
              score: 0,
              goals: 0,
              assists: 0,
              saves: 0,
              shots: 0,
            });
          }

          const stats = playerStatsMap.get(player.playerName)!;
          switch (gameStat.statName) {
            case "RL_SCORE":
              stats.score = Number(value);
              break;
            case "RL_GOALS":
              stats.goals = Number(value);
              break;
            case "RL_ASSISTS":
              stats.assists = Number(value);
              break;
            case "RL_SAVES":
              stats.saves = Number(value);
              break;
            case "RL_SHOTS":
              stats.shots = Number(value);
              break;
          }
        });
      });

      const players: RLPlayerStats[] = Array.from(playerStatsMap.entries())
        .map(([playerName, stats]) => ({
          player: playerName,
          ...stats,
        }))
        .toSorted((a, b) => {
          const aIsWinner = matchWinnersSet.has(a.player);
          const bIsWinner = matchWinnersSet.has(b.player);

          if (aIsWinner && !bIsWinner) return -1;
          if (!aIsWinner && bIsWinner) return 1;

          return b.score - a.score;
        });

      return {
        matchWinners,
        players,
      };
    });

    return {
      setWinners,
      matches,
    };
  });

  return processedSets;
};

const processMarioKartData = (sets: GameSet[]): ProcessedSet[] => {
  return sets.map((set) => {
    const setWinners = set.setWinners.map((p) => p.playerName);

    const matches: ProcessedMatch[] = set.matches.map((match) => {
      const matchWinners = match.matchWinners.map((m) => m.playerName);
      const playerStatsMap = new Map<
        string,
        Omit<MarioKartPlayerStats, "player">
      >();

      match.playerSessions.forEach((ps) => {
        ps.playerStats.forEach(({ player, value, gameStat }) => {
          if (!playerStatsMap.has(player.playerName)) {
            playerStatsMap.set(player.playerName, {
              position: 0,
            });
          }

          const stats = playerStatsMap.get(player.playerName)!;
          if (gameStat.statName === "MK8_POS") {
            stats.position = Number(value);
          }
        });
      });

      const players: MarioKartPlayerStats[] = Array.from(
        playerStatsMap.entries(),
      )
        .map(([playerName, stats]) => ({
          player: playerName,
          ...stats,
        }))
        .toSorted((a, b) => a.position - b.position);

      return {
        matchWinners,
        players,
      };
    });

    return {
      setWinners,
      matches,
    };
  });
};

export const getSetsData = (
  session: SessionForSets | undefined,
): ProcessedSet[] => {
  if (!session?.sets) return [];

  switch (session.Game.gameName) {
    case "Rocket League":
      return processRocketLeagueData(session.sets);
    case "Mario Kart 8":
      return processMarioKartData(session.sets);
    default:
      return [];
  }
};

/** Games `getSetsData` can summarise; MVPs are only generated for these. */
export const MVP_GAMES = ["Rocket League", "Mario Kart 8"] as const;
