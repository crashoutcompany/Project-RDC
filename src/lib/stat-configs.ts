import { StatName } from "./stat-names";

/**
 * Interface describing a stat configuration for a game.
 */
export interface StatConfig {
  id: number;
  name: StatName;
  description: string;
  gameId: number;
  fieldKey: string; // The key from Document Intelligence
  displayName: string;
  category?: "performance" | "outcome" | "offensive" | "defensive";
  dataType: "number" | "position" | "boolean";
  validationRules?: {
    min?: number;
    max?: number;
    allowZero?: boolean;
  };
}

/**
 * All stat configurations for supported games, keyed by fieldKey.
 */
export const STAT_CONFIGS: Record<string, StatConfig> = {
  // Mario Kart 8 Stats
  mk8_place: {
    id: 1,
    name: StatName.MK8_POS,
    description: "Mario Kart 8 Position",
    gameId: 1,
    fieldKey: "mk8_place",
    displayName: "Position",
    category: "outcome",
    dataType: "position",
    validationRules: { min: 1, max: 8 },
  },
  mk8_day: {
    id: 2,
    name: StatName.MK8_DAY,
    description: "Mario Kart 8 Days",
    gameId: 1,
    fieldKey: "mk8_day",
    displayName: "Days Played",
    category: "performance",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  // Rocket League Stats
  rl_score: {
    id: 3,
    name: StatName.RL_SCORE,
    description: "Rocket League Score",
    gameId: 2,
    fieldKey: "rl_score",
    displayName: "Score",
    category: "performance",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  rl_goals: {
    id: 4,
    name: StatName.RL_GOALS,
    description: "Rocket League Goals",
    gameId: 2,
    fieldKey: "rl_goals",
    displayName: "Goals",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  rl_assists: {
    id: 5,
    name: StatName.RL_ASSISTS,
    description: "Rocket League Assists",
    gameId: 2,
    fieldKey: "rl_assists",
    displayName: "Assists",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  rl_saves: {
    id: 6,
    name: StatName.RL_SAVES,
    description: "Rocket League Saves",
    gameId: 2,
    fieldKey: "rl_saves",
    displayName: "Saves",
    category: "defensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  rl_shots: {
    id: 7,
    name: StatName.RL_SHOTS,
    description: "Rocket League Shots",
    gameId: 2,
    fieldKey: "rl_shots",
    displayName: "Shots",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  rl_day: {
    id: 8,
    name: StatName.RL_DAY,
    description: "Rocket League Days",
    gameId: 2,
    fieldKey: "rl_day",
    displayName: "Days Played",
    category: "performance",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },

  // Call of Duty Stats
  cod_score: {
    id: 9,
    name: StatName.COD_SCORE,
    description: "Call of Duty Score",
    gameId: 3,
    fieldKey: "cod_score",
    displayName: "Score",
    category: "performance",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  cod_kills: {
    id: 10,
    name: StatName.COD_KILLS,
    description: "Call of Duty Kills",
    gameId: 3,
    fieldKey: "cod_kills",
    displayName: "Kills",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  cod_deaths: {
    id: 11,
    name: StatName.COD_DEATHS,
    description: "Call of Duty Deaths",
    gameId: 3,
    fieldKey: "cod_deaths",
    displayName: "Deaths",
    category: "defensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  cod_pos: {
    id: 12,
    name: StatName.COD_POS,
    description: "Call of Duty Position",
    gameId: 3,
    fieldKey: "cod_pos",
    displayName: "Position",
    category: "outcome",
    dataType: "position",
    validationRules: { min: 1, max: 8 },
  },
  cod_melees: {
    id: 13,
    name: StatName.COD_MELEES,
    description: "Call of Duty Melee Kills",
    gameId: 3,
    fieldKey: "cod_melees",
    displayName: "Melee Kills",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },

  // TODO RUN MIGRATION TO ADD THIS STAT ^

  // Lethal Company Stats
  lc_deaths: {
    id: 14,
    name: StatName.LC_DEATHS,
    description: "Lethal Company Deaths",
    gameId: 4,
    fieldKey: "lc_deaths",
    displayName: "Deaths",
    category: "outcome",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },

  // Speed Runners Stats
  sr_wins: {
    id: 15,
    name: StatName.SR_WINS,
    description: "Speedrunners Wins",
    gameId: 5,
    fieldKey: "sr_wins",
    displayName: "Wins",
    category: "outcome",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  sr_sets: {
    id: 16,
    name: StatName.SR_SETS,
    description: "Speedrunners Sets",
    gameId: 5,
    fieldKey: "sr_sets",
    displayName: "Sets",
    category: "performance",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  sr_pos: {
    id: 17,
    name: StatName.SR_POS,
    description: "Speedrunners Position",
    gameId: 5,
    fieldKey: "sr_pos",
    displayName: "Position",
    category: "outcome",
    dataType: "position",
    validationRules: { min: 1, max: 8 },
  },

  // Marvel Rivals
  mr_kills: {
    id: 18,
    name: StatName.MR_KILLS,
    description: "Marvel Rivals Kills",
    gameId: 6,
    fieldKey: "mr_kills",
    displayName: "Kills",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_deaths: {
    id: 19,
    name: StatName.MR_DEATHS,
    description: "Marvel Rivals Deaths",
    gameId: 6,
    fieldKey: "mr_deaths",
    displayName: "Deaths",
    category: "defensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_assists: {
    id: 20,
    name: StatName.MR_ASSISTS,
    description: "Marvel Rivals Assists",
    gameId: 6,
    fieldKey: "mr_assists",
    displayName: "Assists",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_triple_kill: {
    id: 21,
    name: StatName.MR_TRIPLE_KILL,
    description: "Marvel Rivals Triple Kill",
    gameId: 6,
    fieldKey: "mr_triple_kill",
    displayName: "Triple Kills",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_quadra_kill: {
    id: 22,
    name: StatName.MR_QUADRA_KILL,
    description: "Marvel Rivals Quadra Kill",
    gameId: 6,
    fieldKey: "mr_quadra_kill",
    displayName: "Quadra Kills",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_penta_kill: {
    id: 23,
    name: StatName.MR_PENTA_KILL,
    description: "Marvel Rivals Penta Kill",
    gameId: 6,
    fieldKey: "mr_penta_kill",
    displayName: "Penta Kills",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_hexa_kill: {
    id: 24,
    name: StatName.MR_HEXA_KILL,
    description: "Marvel Rivals Hexa Kill",
    gameId: 6,
    fieldKey: "mr_hexa_kill",
    displayName: "Hexa Kills",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },

  mr_highest_dmg: {
    id: 26,
    name: StatName.MR_HIGHEST_DMG,
    description: "Marvel Rivals Highest Damage",
    gameId: 6,
    fieldKey: "mr_highest_dmg",
    displayName: "Highest Damage",
    category: "performance",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_highest_dmg_blocked: {
    id: 27,
    name: StatName.MR_HIGHEST_DMG_BLOCKED,
    description: "Marvel Rivals Highest Damage Blocked",
    gameId: 6,
    fieldKey: "mr_highest_dmg_blocked",
    displayName: "Highest Damage Blocked",
    category: "defensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_most_healing: {
    id: 28,
    name: StatName.MR_MOST_HEALING,
    description: "Marvel Rivals Most Healing",
    gameId: 6,
    fieldKey: "mr_most_healing",
    displayName: "Most Healing+",
    category: "performance",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_most_assists: {
    id: 29,
    name: StatName.MR_MOST_ASSISTS,
    description: "Marvel Rivals Most Assists Fist",
    gameId: 6,
    fieldKey: "MR_MOST_ASSISTS",
    displayName: "Most Assists (Fist)",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_final_hits: {
    id: 30,
    name: StatName.MR_FINAL_HITS,
    description: "Marvel Rivals Final Hits",
    gameId: 6,
    fieldKey: "mr_final_hits",
    displayName: "Final Hits",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_dmg: {
    id: 31,
    name: StatName.MR_DMG,
    description: "Marvel Rivals Damage",
    gameId: 6,
    fieldKey: "mr_dmg",
    displayName: "Damage",
    category: "performance",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_dmg_blocked: {
    id: 32,
    name: StatName.MR_DMG_BLOCKED,
    description: "Marvel Rivals Damage Blocked",
    gameId: 6,
    fieldKey: "mr_dmg_blocked",
    displayName: "Damage Blocked",
    category: "defensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_healing: {
    id: 33,
    name: StatName.MR_HEALING,
    description: "Marvel Rivals Healing",
    gameId: 6,
    fieldKey: "mr_healing",
    displayName: "Healing",
    category: "performance",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_accuracy: {
    id: 34,
    name: StatName.MR_ACCURACY,
    description: "Marvel Rivals Accuracy",
    gameId: 6,
    fieldKey: "mr_accuracy",
    displayName: "Accuracy",
    category: "performance",
    dataType: "number",
    validationRules: { min: 0, max: 100, allowZero: true },
  },
  mr_most_kills: {
    id: 35,
    name: StatName.MR_MOST_KILLS,
    description: "Marvel Rivals Most Kills",
    gameId: 6,
    fieldKey: "mr_most_kills",
    displayName: "Most Kills",
    category: "offensive",
    dataType: "number",
    validationRules: { min: 0, allowZero: true },
  },
  mr_mvp: {
    id: 36,
    name: StatName.MR_MVP,
    description: "Marvel Rivals MVP (Most Valuable Player - Winner)",
    gameId: 6,
    fieldKey: "mr_mvp",
    displayName: "MVP",
    category: "performance",
    dataType: "boolean",
    validationRules: { min: 0, max: 1, allowZero: true },
  },
  mr_svp: {
    id: 37,
    name: StatName.MR_SVP,
    description: "Marvel Rivals SVP (Second Valuable Player - Loser)",
    gameId: 6,
    fieldKey: "mr_svp",
    displayName: "SVP",
    category: "performance",
    dataType: "boolean",
    validationRules: { min: 0, max: 1, allowZero: true },
  },
};

// Utility functions to work with stat configs
/**
 * Returns the stat config for a given field key.
 * @param fieldKey - The field key to look up.
 * @returns StatConfig or undefined.
 */
export const getStatConfigByFieldKey = (
  fieldKey: string,
): StatConfig | undefined => {
  return STAT_CONFIGS[fieldKey];
};

/**
 * Returns all stat configs for a given game ID.
 * @param gameId - The game ID.
 * @returns Array of StatConfig.
 */
export const getStatConfigsByGame = (gameId: number): StatConfig[] => {
  return Object.values(STAT_CONFIGS).filter((stat) => stat.gameId === gameId);
};

/**
 * Returns all stat configs for a given category.
 * @param category - The stat category.
 * @returns Array of StatConfig.
 */
export const getStatConfigsByCategory = (
  category: StatConfig["category"],
): StatConfig[] => {
  return Object.values(STAT_CONFIGS).filter(
    (stat) => stat.category === category,
  );
};

export const statDescriptions: { [key in StatName]: string } = Object.values(
  STAT_CONFIGS,
).reduce(
  (acc, config) => {
    acc[config.name] = config.description;
    return acc;
  },
  {} as { [key in StatName]: string },
);
