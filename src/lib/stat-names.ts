export const StatName = {
  // Mario Kart 8
  MK8_POS: "MK8_POS",
  MK8_DAY: "MK8_DAY",

  // Rocket League
  RL_SCORE: "RL_SCORE",
  RL_GOALS: "RL_GOALS",
  RL_ASSISTS: "RL_ASSISTS",
  RL_SAVES: "RL_SAVES",
  RL_SHOTS: "RL_SHOTS",
  RL_DAY: "RL_DAY",

  // Call of Duty
  COD_KILLS: "COD_KILLS",
  COD_DEATHS: "COD_DEATHS",
  COD_SCORE: "COD_SCORE",
  COD_POS: "COD_POS",
  COD_MELEES: "COD_MELEES",

  // Lethal Company
  LC_DEATHS: "LC_DEATHS",

  // SpeedRunners
  SR_WINS: "SR_WINS",
  SR_SETS: "SR_SETS",
  SR_POS: "SR_POS",

  // Marvel Rivals
  MR_KILLS: "MR_KILLS",
  MR_DEATHS: "MR_DEATHS",
  MR_ASSISTS: "MR_ASSISTS",
  MR_TRIPLE_KILL: "MR_TRIPLE_KILL",
  MR_QUADRA_KILL: "MR_QUADRA_KILL",
  MR_PENTA_KILL: "MR_PENTA_KILL",
  MR_HEXA_KILL: "MR_HEXA_KILL",
  MR_MOST_KILLS: "MR_MOST_KILLS",
  MR_HIGHEST_DMG: "MR_HIGHEST_DMG",
  MR_HIGHEST_DMG_BLOCKED: "MR_HIGHEST_DMG_BLOCKED",
  MR_MOST_HEALING: "MR_MOST_HEALING",
  MR_MOST_ASSISTS: "MR_MOST_ASSISTS",
  MR_FINAL_HITS: "MR_FINAL_HITS",
  MR_DMG: "MR_DMG",
  MR_DMG_BLOCKED: "MR_DMG_BLOCKED",
  MR_HEALING: "MR_HEALING",
  MR_ACCURACY: "MR_ACCURACY",
  MR_MVP: "MR_MVP",
  MR_SVP: "MR_SVP",
} as const;

export type StatName = (typeof StatName)[keyof typeof StatName];

// Export as array for backward compatibility and iteration
export const statNames = Object.values(StatName);
