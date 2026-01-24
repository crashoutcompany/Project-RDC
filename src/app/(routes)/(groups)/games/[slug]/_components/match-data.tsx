import { useMemo, useState } from "react";
import { getAllSessionsByGame } from "prisma/lib/admin";
import { SetData } from "./set-data";
import { QueryResponseData } from "prisma/db";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type Sessions = QueryResponseData<
  Awaited<ReturnType<typeof getAllSessionsByGame>>
>;

const MatchData = ({ session }: { session: Sessions[0] | undefined }) => {
  const sets = useMemo(() => {
    if (!session) return [];
    return getSetsData(session);
  }, [session]);
  const [currentSet, setCurrentSet] = useState(0);

  return (
    <div className="my-6">
      {sets.length > 0 && (
        <>
          <SetNavigation
            currentSet={currentSet}
            setCurrentSet={setCurrentSet}
            maxSets={sets.length}
          />
          <SetData
            set={sets[currentSet]}
            setIndex={currentSet}
            game={session?.Game.gameName}
          />
          <SetNavigation
            currentSet={currentSet}
            setCurrentSet={setCurrentSet}
            maxSets={sets.length}
          />
        </>
      )}
    </div>
  );
};
export default MatchData;

const SetNavigation = ({
  currentSet,
  setCurrentSet,
  maxSets,
}: {
  currentSet: number;
  setCurrentSet: React.Dispatch<React.SetStateAction<number>>;
  maxSets: number;
}) => {
  const getSetNumbers = () => {
    const numbers: (number | "...")[] = [];
    const currentPage = currentSet + 1;
    const totalPages = maxSets;

    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    numbers.push(1);

    if (currentPage <= 3) {
      numbers.push(2, 3, "...", totalPages);
    } else if (currentPage >= totalPages - 2) {
      numbers.push("...", totalPages - 2, totalPages - 1, totalPages);
    } else {
      numbers.push(
        "...",
        currentPage - 1,
        currentPage,
        currentPage + 1,
        "...",
        totalPages,
      );
    }

    return numbers;
  };

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            onClick={() => currentSet > 0 && setCurrentSet((curr) => curr - 1)}
            className={
              currentSet === 0
                ? "pointer-events-none opacity-50"
                : "cursor-pointer"
            }
          />
        </PaginationItem>

        {getSetNumbers().map((setNumber, index) => {
          if (setNumber === "...") {
            return (
              <PaginationItem
                className="cursor-pointer"
                key={`ellipsis-${index}`}
              >
                <PaginationEllipsis />
              </PaginationItem>
            );
          }

          return (
            <PaginationItem key={setNumber}>
              <PaginationLink
                className="cursor-pointer"
                onClick={() => setCurrentSet(setNumber - 1)}
                isActive={currentSet === setNumber - 1}
              >
                {setNumber}
              </PaginationLink>
            </PaginationItem>
          );
        })}

        <PaginationItem>
          <PaginationNext
            onClick={() =>
              currentSet < maxSets - 1 && setCurrentSet((curr) => curr + 1)
            }
            className={
              currentSet === maxSets - 1
                ? "pointer-events-none opacity-50"
                : "cursor-pointer"
            }
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
};

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

export const getSetsData = (session: Sessions[0]) => {
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
