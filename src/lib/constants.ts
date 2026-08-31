import { StatName } from "@/lib/stat-names";
import { getAllGames } from "prisma/lib/games";

export enum MembersEnum {
  Mark = "mark",
  Ipi = "ipi",
  John = "john",
  Aff = "aff",
  Lee = "lee",
  Dylan = "dylan",
  Ben = "ben",
  Des = "des",
}

export const getGamesNav = async () => {
  const games = await getAllGames();

  if (!games.success || !games.data) return [];

  const navGames: {
    alt?: string;
    name: string;
    url: string;
    src?: string;
    desc?: string;
  }[] = games.data.map((game) => {
    const gameKey = game.gameName.replace(/\s/g, "").toLowerCase() as GamesEnum;
    return {
      alt: game.gameName,
      desc: gamesNav.get(gameKey) || "",
      name: game.gameName,
      url: `/games/${gameKey}`,
      src: `/images/${gameImages[gameKey]}`,
    };
  });
  navGames.push({ name: "Browse all games", url: "/games" });
  return navGames;
};

export enum GamesEnum {
  RocketLeague = "rocketleague",
  LethalCompany = "lethalcompany",
  CallOfDuty = "callofduty",
  MarioKart8 = "mariokart8",
  SpeedRunners = "speedrunners",
}

const gamesNav = new Map<GamesEnum, string>([
  [GamesEnum.RocketLeague, "Stats from the most intense 3v3 battles."],
  [GamesEnum.LethalCompany, "Stats that tell you who touches the most paper."],
  [GamesEnum.CallOfDuty, "Stats for FFA's and who sells the most online."],
  [GamesEnum.MarioKart8, "Stats that tell you who races the hardest."],
  [GamesEnum.SpeedRunners, "Stats that tell you who races the hardest."],
]);

export const gameImages = {
  [GamesEnum.RocketLeague]: "rocketleague.png",
  [GamesEnum.LethalCompany]: "lethalcompany.jpg",
  [GamesEnum.MarioKart8]: "mk8.jpg",
  [GamesEnum.SpeedRunners]: "speedrunners.jpeg",
  [GamesEnum.CallOfDuty]: "callofduty.jpeg",
};
export const statDescriptions: { [key in StatName]: string } = {
  [StatName.MK8_DAY]: "Mario Kart 8 Days",
  [StatName.MK8_POS]: "Mario Kart 8 Position",
  [StatName.COD_SCORE]: "Call of Duty Score",
  [StatName.COD_KILLS]: "Call of Duty Kills",
  [StatName.COD_DEATHS]: "Call of Duty Deaths",
  [StatName.COD_MELEES]: "Call of Duty Melees",
  [StatName.COD_POS]: "Call of Duty Position",
  [StatName.LC_DEATHS]: "Lethal Company Deaths",
  [StatName.SR_SETS]: "Speedrunners Sets",
  [StatName.SR_WINS]: "Speedrunners Wins",
  [StatName.SR_POS]: "Speedrunners Position",
  [StatName.RL_GOALS]: "Rocket League Goals",
  [StatName.RL_ASSISTS]: "Rocket League Assists",
  [StatName.RL_SAVES]: "Rocket League Saves",
  [StatName.RL_SHOTS]: "Rocket League Shots",
  [StatName.RL_SCORE]: "Rocket League Score",
  [StatName.RL_DAY]: "Rocket League Days",
  [StatName.MR_KILLS]: "Marvel Rivals Kills",
  [StatName.MR_DEATHS]: "Marvel Rivals Deaths",
  [StatName.MR_ASSISTS]: "Marvel Rivals Assists",
  [StatName.MR_TRIPLE_KILL]: "Marvel Rivals Triple Kills",
  [StatName.MR_QUADRA_KILL]: "Marvel Rivals Quadra Kills",
  [StatName.MR_PENTA_KILL]: "Marvel Rivals Penta Kills",
  [StatName.MR_HEXA_KILL]: "Marvel Rivals Hexa Kills",
  [StatName.MR_MOST_KILLS]: "Marvel Rivals Most Kills",
  [StatName.MR_HIGHEST_DMG]: "Marvel Rivals Highest Damage",
  [StatName.MR_HIGHEST_DMG_BLOCKED]: "Marvel Rivals Highest Damage Blocked",
  [StatName.MR_MOST_HEALING]: "Marvel Rivals Most Healing",
  [StatName.MR_MOST_ASSISTS]: "Marvel Rivals Most Assists (Fist)",
  [StatName.MR_FINAL_HITS]: "Marvel Rivals Final Hits",
  [StatName.MR_DMG]: "Marvel Rivals Damage",
  [StatName.MR_DMG_BLOCKED]: "Marvel Rivals Damage Blocked",
  [StatName.MR_HEALING]: "Marvel Rivals Healing",
  [StatName.MR_ACCURACY]: "Marvel Rivals Accuracy",
};

export enum errorCodes {
  NotAuthenticated = "Not Authenticated",
  NotAuthorized = "Not Authorized",
}

export enum VisionResultCodes {
  Success = "Success",
  Failed = "Failed",
  CheckRequest = "CheckReq",
}

// Enhanced game configs with stat references
export type GameType = "TEAM" | "SOLO";

export interface GameConfig {
  type: GameType;
  id: number;
  name: string;
  modelId: string;
  supportedStats: string[]; // Field keys for this game
}

export const GAME_CONFIGS: Record<number, GameConfig> = {
  1: {
    type: "SOLO",
    id: 1,
    name: "Mario Kart 8",
    modelId: "RDC-MK8",
    supportedStats: ["mk8_place", "mk8_day"],
  },
  2: {
    type: "TEAM",
    id: 2,
    name: "Rocket League",
    modelId: "RDC-RL",
    supportedStats: [
      "rl_score",
      "rl_goals",
      "rl_assists",
      "rl_saves",
      "rl_shots",
      "rl_day",
    ],
  },
  3: {
    type: "SOLO",
    id: 3,
    name: "Call of Duty",
    modelId: "RDC-COD",
    supportedStats: [
      "cod_score",
      "cod_kills",
      "cod_deaths",
      "cod_pos",
      "cod_melees",
    ],
  },
  4: {
    type: "TEAM",
    id: 4,
    name: "Lethal Company",
    modelId: "RDC-LC",
    supportedStats: ["lc_deaths"],
  },
  5: {
    type: "SOLO",
    id: 5,
    name: "Speed Runners",
    modelId: "RDC-SR",
    supportedStats: ["sr_wins", "sr_sets", "sr_pos"],
  },
  6: {
    type: "SOLO",
    id: 6,
    name: "Marvel Rivals",
    modelId: "RDC-MR",
    supportedStats: [
      "mr_kills",
      "mr_deaths",
      "mr_assists",
      "mr_triple_kill",
      "mr_quadra_kill",
      "mr_penta_kill",
      "mr_hexa_kill",
      "mr_highest_dmg",
      "mr_highest_dmg_blocked",
      "mr_most_healing",
      "MR_MOST_ASSISTS",
      "mr_final_hits",
      "mr_dmg",
      "mr_dmg_blocked",
      "mr_healing",
      "mr_accuracy",
    ],
  },
};

export const RL_TEAM_MAPPING = {
  BluePlayers: "blueTeam",
  OrangePlayers: "orangeTeam",
} as const;
