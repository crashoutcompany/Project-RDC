import { GamesEnum } from "@/lib/constants";

/** Neon accent per stage, used for the stage number and table rails. */
export const ARENA_TEXT: Record<GamesEnum, string> = {
  [GamesEnum.MarioKart8]: "text-ac-red",
  [GamesEnum.RocketLeague]: "text-ac-blue",
  [GamesEnum.CallOfDuty]: "text-ac-pink",
  [GamesEnum.LethalCompany]: "text-ac-green",
  [GamesEnum.SpeedRunners]: "text-ac-gold",
  [GamesEnum.MarvelRivals]: "text-[#b07bff]",
};

export const ARENA_BAR: Record<GamesEnum, string> = {
  [GamesEnum.MarioKart8]: "bg-ac-red",
  [GamesEnum.RocketLeague]: "bg-ac-blue",
  [GamesEnum.CallOfDuty]: "bg-ac-pink",
  [GamesEnum.LethalCompany]: "bg-ac-green",
  [GamesEnum.SpeedRunners]: "bg-ac-gold",
  [GamesEnum.MarvelRivals]: "bg-[#b07bff]",
};
