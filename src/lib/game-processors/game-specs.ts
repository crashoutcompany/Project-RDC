import type { VisionPlayer } from "@/lib/visionTypes";
import { GAME_REGISTRY, GamesEnum } from "../games";
import { getStatConfigByFieldKey } from "../stat-configs";
import type { StatName } from "../stat-names";
import type { StatCheck } from "./game-processor-utils";

/** How a match's winners follow from the players' stats. */
export type WinnerRule =
  /** One player: the best value of a stat. The first row wins a tie. */
  | { by: "highest" | "lowest"; stat: StatName }
  /**
   * Every player of the winning team: the one the reader saw marked as the
   * winner, or failing that the one whose stat adds up highest.
   */
  | { by: "team-total"; stat: StatName };

/**
 * Everything game-specific about turning a scoreboard read into a match.
 * `processGameScoreboard` runs any spec; supporting a game is one entry here.
 */
export interface GameProcessorSpec {
  /** games.game_id. */
  gameId: number;
  name: string;
  /**
   * The shape the readers return for this game: every player in one array,
   * or one array per team. `teams` lists the team fields to read (others are
   * ignored) and `statPrefix` completes bare field names ("Goals" → rl_goals).
   */
  input:
    | { layout: "solo" }
    | { layout: "teams"; teams: readonly string[]; statPrefix?: string };
  /**
   * What a read with no player rows means. By default it is a read with
   * nobody in it; set this to send it to the admin for review instead.
   */
  reviewEmptyRead?: boolean;
  /**
   * Fixes this game's known OCR misreads. Only applied to readers that make
   * them (Azure), and always sends a corrected value to review.
   */
  correctStat?: (statValue: string, numPlayers: number) => StatCheck;
  /** Runs once every row is mapped, before corrections and winners. */
  finalize?: (players: VisionPlayer[]) => VisionPlayer[];
  winner: WinnerRule;
}

/** Azure's MK8 model sometimes reads a 1 as a 7; nobody finishes 7th of six. */
const correctMarioKartPlace = (
  statValue: string,
  numPlayers: number,
): StatCheck => {
  if (!statValue) return { statValue: "0", reqCheck: true };

  const place = parseInt(statValue);
  if (isNaN(place)) return { statValue: "0", reqCheck: true };
  if (place === 7 && numPlayers < 7) return { statValue: "1", reqCheck: true };

  return { statValue, reqCheck: false };
};

/** Gun Game positions follow score: sorts by COD_SCORE and rewrites COD_POS. */
const rankByCodScore = (players: VisionPlayer[]): VisionPlayer[] => {
  const scoreOf = (player: VisionPlayer) =>
    parseInt(
      player.stats.find((stat) => stat.stat === "COD_SCORE")?.statValue || "0",
    );

  return players
    .toSorted((a, b) => scoreOf(b) - scoreOf(a))
    .map((player, index) => {
      const position = String(index + 1);
      const existing = player.stats.find((stat) => stat.stat === "COD_POS");
      if (existing) existing.statValue = position;
      else
        player.stats.push({
          statId: getStatConfigByFieldKey("cod_pos")?.id || 12,
          stat: "COD_POS",
          statValue: position,
        });
      return player;
    });
};

/** What a game adds to its registry entry; identity and layout come from there. */
type GameProcessing = Omit<GameProcessorSpec, "gameId" | "name" | "input"> & {
  /** For team games: the reader's field for each team. Other fields are ignored. */
  teamFields?: readonly string[];
};

/** Games with no entry here have no processor, so their imports fail. */
const PROCESSING: Partial<Record<GamesEnum, GameProcessing>> = {
  [GamesEnum.MarioKart8]: {
    correctStat: correctMarioKartPlace,
    winner: { by: "lowest", stat: "MK8_POS" },
  },
  [GamesEnum.RocketLeague]: {
    teamFields: ["BluePlayers", "OrangePlayers"],
    winner: { by: "team-total", stat: "RL_GOALS" },
  },
  [GamesEnum.CallOfDuty]: {
    finalize: rankByCodScore,
    winner: { by: "highest", stat: "COD_SCORE" },
  },
  [GamesEnum.MarvelRivals]: {
    reviewEmptyRead: true,
    // The scoreboard doesn't show which side won, so the import proposes the
    // top fragger. The form allows no winner for this game, so an admin can
    // clear it (e.g. when the whole squad lost).
    winner: { by: "highest", stat: "MR_KILLS" },
  },
};

export const GAME_PROCESSOR_SPECS: GameProcessorSpec[] = Object.entries(
  PROCESSING,
).map(([slug, { teamFields, ...spec }]) => {
  const game = GAME_REGISTRY[slug as GamesEnum];
  return {
    ...spec,
    gameId: game.gameId,
    name: game.name,
    input: game.teams
      ? {
          layout: "teams",
          teams: teamFields ?? [],
          statPrefix: game.statPrefix.toLowerCase(),
        }
      : { layout: "solo" },
  };
});

/** The spec for a games.game_id. Throws for a game with no processor. */
export function getGameProcessorSpec(gameId: number): GameProcessorSpec {
  const spec = GAME_PROCESSOR_SPECS.find((s) => s.gameId === gameId);
  if (!spec) throw new Error(`Invalid game id: ${gameId}`);
  return spec;
}
