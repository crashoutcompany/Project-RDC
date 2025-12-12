"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { GameStat } from "@/generated/prisma/client";
import { getGameStats } from "@/app/actions/adminAction";
import { ReactNode } from "react";

interface AdminContextType {
  gameStats: GameStat[];
  getGameStatsFromDb: (gameName: string) => Promise<GameStat[]>;
}

export const AdminContext = createContext<AdminContextType>({
  gameStats: [],
  getGameStatsFromDb: async () => [],
});

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const [gameStats, setGameStats] = useState<GameStat[]>([]);

  // ! Can we fetch all game stats at once and then serve the values from state?
  const getGameStatsFromDb = useCallback(
    async (gameName: string): Promise<GameStat[]> => {
      console.log("Getting game stats from db for game: ", gameName);
      try {
        const gameStats = await getGameStats(gameName);
        const filteredGameStats = gameStats.filter(
          (stat) => !stat.statName.endsWith("_DAY"),
        );
        setGameStats(filteredGameStats);
        return filteredGameStats;
      } catch (error) {
        console.error("Error getting game stats: ", error);
        return [];
      }
    },
    [],
  );

  const value = useMemo(
    () => ({ gameStats, getGameStatsFromDb }),
    [gameStats, getGameStatsFromDb],
  );

  return <AdminContext value={value}>{children}</AdminContext>;
};

export const useAdmin = () => {
  return useContext(AdminContext);
};
