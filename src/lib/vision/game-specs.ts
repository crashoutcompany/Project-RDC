import z from "zod";
import { GAME_CONFIGS } from "@/lib/constants";
import { getStatConfigsByGame, StatConfig } from "@/lib/stat-configs";

/**
 * Builds the structured-output schema and prompt for a game's scoreboard
 * directly from `STAT_CONFIGS`/`GAME_CONFIGS`, so adding LLM-vision support
 * for a new game means adding stat configs, not training a new model.
 */

const statFieldSchema = (stat: StatConfig) => {
  const range =
    stat.validationRules?.min !== undefined ||
    stat.validationRules?.max !== undefined
      ? ` (typical range ${stat.validationRules?.min ?? "?"}-${stat.validationRules?.max ?? "?"})`
      : "";
  return z
    .union([z.string(), z.number()])
    .optional()
    .describe(`${stat.displayName}: ${stat.description}${range}`);
};

const buildPlayerSchema = (statConfigs: StatConfig[]) => {
  const statFields = Object.fromEntries(
    statConfigs.map((stat) => [stat.fieldKey, statFieldSchema(stat)] as const),
  );
  return z.object({
    name: z
      .string()
      .describe(
        "Player name or gamertag exactly as it appears on the scoreboard",
      ),
    ...statFields,
  });
};

export const buildGameOutputSchema = (gameId: number) => {
  const gameConfig = GAME_CONFIGS[gameId];
  if (!gameConfig) throw new Error(`Unknown gameId for vision: ${gameId}`);

  const playerSchema = buildPlayerSchema(getStatConfigsByGame(gameId));
  const isTeamGame = gameConfig.type === "TEAM";

  return z.object({
    teams: z
      .array(
        z.object({
          teamKey: z
            .string()
            .describe(
              'Team identifier as shown on screen, e.g. "blue" or "orange"',
            ),
          players: z.array(playerSchema),
        }),
      )
      .optional()
      .describe(
        isTeamGame
          ? "Required — group every player into their team."
          : "Not used for this game; omit it.",
      ),
    players: z
      .array(playerSchema)
      .optional()
      .describe(
        isTeamGame
          ? "Not used for this game; omit it."
          : "Required — every player goes here, ungrouped.",
      ),
  });
};

/**
 * Hand-written to match what `buildGameOutputSchema` actually produces at
 * runtime.
 */
export interface RawVisionPlayer {
  name: string;
  [statFieldKey: string]: string | number | undefined;
}

export interface RawVisionOutput {
  teams?: { teamKey: string; players: RawVisionPlayer[] }[];
  players?: RawVisionPlayer[];
}

export const buildVisionPrompt = (
  gameId: number,
  rosterHint: string[],
): string => {
  const gameConfig = GAME_CONFIGS[gameId];
  if (!gameConfig) throw new Error(`Unknown gameId for vision: ${gameId}`);

  const statConfigs = getStatConfigsByGame(gameId);
  const statList = statConfigs
    .map((stat) => `- ${stat.fieldKey}: ${stat.description}`)
    .join("\n");
  const roster = rosterHint.length
    ? `Known players in this session: ${rosterHint.join(", ")}. Match each scoreboard row to the closest of these names/gamertags, but still report the name exactly as it appears on screen.`
    : "";

  return `You are reading an end-of-match scoreboard screenshot from ${gameConfig.name}.
Extract every player row exactly as shown.${gameConfig.type === "TEAM" ? " Group players by their team." : ""}

Stats to extract for each player:
${statList}

${roster}

Rules:
- Copy numbers exactly as displayed; do not compute or guess a value that isn't visible.
- Omit a stat entirely for a player if it is not visible on screen, rather than guessing 0.
- Return only the structured data, no commentary.`;
};
