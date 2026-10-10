import { STAT_CONFIGS, type StatConfig } from "@/lib/stat-configs";
import type { StatName } from "@/lib/stat-names";

/**
 * Everything the benchmark needs to know about a game's end-of-match screen.
 * The prompt, output schema, and scorer are all generated from this, so adding
 * a game is one entry here plus a dataset.
 */
export interface GameSpec {
  id: string;
  displayName: string;
  /** games.game_id, also the Azure model/processor selector. */
  gameId: number;
  /** Field keys from stat-configs.ts that are visible on the screenshot. */
  screenStats: string[];
  teams: boolean;
  /** How winners follow from the screen when it doesn't label them. */
  winner: { by: "team-label" } | { by: "lowest" | "highest"; stat: StatName };
  /** One paragraph describing the screen to the model. */
  screen: string;
  /** Yes/no question for the scoreboard finder (Decisions API). */
  finderQuestion: string;
}

export const GAMES: Record<string, GameSpec> = {
  "rocket-league": {
    id: "rocket-league",
    displayName: "Rocket League",
    gameId: 2,
    screenStats: ["rl_score", "rl_goals", "rl_assists", "rl_saves", "rl_shots"],
    teams: true,
    winner: { by: "team-label" },
    screen:
      "The post-match scoreboard lists two teams (BLUE and ORANGE), each with up to 3 player rows and the columns SCORE, GOALS, ASSISTS, SAVES, SHOTS, PING. " +
      'The winning team has "WINNER" above its name. Some rows show a title under the gamertag (e.g. "LEGEND", "HAPPY CAMPER", "AUTOBOT"); that is not a separate player. ' +
      'The game font draws zero as "Ø". Ignore stream overlays such as chat, sub goals, and the webcam.',
    finderQuestion:
      "Is this frame Rocket League's end-of-match scoreboard: two team tables with SCORE, GOALS, ASSISTS, SAVES and SHOTS columns and a WINNER label? " +
      "Answer no for gameplay, menus, replays, and the in-match scoreboard that has no WINNER label.",
  },
  "mario-kart-8": {
    id: "mario-kart-8",
    displayName: "Mario Kart 8",
    gameId: 1,
    screenStats: ["mk8_place"],
    teams: false,
    winner: { by: "lowest", stat: "MK8_POS" },
    screen:
      "After each race a results panel (often in the top-right corner, over the course) lists every racer in finishing order. " +
      "Each row has the finishing place (1, 2, 3, ...), a character icon, the racer's name, a flag, the points just gained (+N), and their total. " +
      "Read the place number at the left of each row. Stream overlays (sub goal counters, chat, webcam) may cover part of the panel; ignore them.",
    finderQuestion:
      "Is this frame Mario Kart 8's race results panel: racers listed by finishing place with names, flags and points? " +
      "Answer no for racing, menus, course selection, and the cup podium.",
  },
};

export function resolveGame(id: string): GameSpec {
  const spec = GAMES[id];
  if (!spec)
    throw new Error(`Unknown game "${id}". Known: ${Object.keys(GAMES).join(", ")}`);
  return spec;
}

/** Stat configs for the stats visible on this game's screen, in column order. */
export function screenStatConfigs(spec: GameSpec): StatConfig[] {
  return spec.screenStats.map((key) => {
    const config = STAT_CONFIGS[key];
    if (!config) throw new Error(`${spec.id}: no stat config "${key}"`);
    return config;
  });
}
