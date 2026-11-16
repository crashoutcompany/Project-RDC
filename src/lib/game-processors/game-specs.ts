import type { VisionPlayer } from "@/lib/visionTypes";
import { RL_TEAM_MAPPING } from "../constants";
import { getStatConfigByFieldKey } from "../stat-configs";
import type { StatName } from "../stat-names";
import type { StatCheck } from "./game-processor-utils";

/** How a match's winners follow from the players' stats. */
export type WinnerRule =
  /** One player: the best value of a stat. The first row wins a tie. */
  | { by: "highest" | "lowest"; stat: StatName }
  /** Every player of the team whose stat adds up highest. */
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
  /** Which problems send the import to the admin for review. */
  review: {
    /** A stat that was missing, unreadable or out of range. */
    unreadableStat: boolean;
    /** A row that isn't one of the session's players (the row is dropped). */
    unknownPlayer: boolean;
    /** A read with no player rows; when false such a read has no players. */
    noRows: boolean;
  };
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

export const GAME_PROCESSOR_SPECS: GameProcessorSpec[] = [
  {
    gameId: 1,
    name: "Mario Kart 8",
    input: { layout: "solo" },
    review: { unreadableStat: true, unknownPlayer: false, noRows: false },
    correctStat: correctMarioKartPlace,
    winner: { by: "lowest", stat: "MK8_POS" },
  },
  {
    gameId: 2,
    name: "Rocket League",
    input: {
      layout: "teams",
      teams: Object.keys(RL_TEAM_MAPPING),
      statPrefix: "rl",
    },
    review: { unreadableStat: true, unknownPlayer: true, noRows: false },
    winner: { by: "team-total", stat: "RL_GOALS" },
  },
  {
    gameId: 3,
    name: "Call of Duty",
    input: { layout: "solo" },
    review: { unreadableStat: false, unknownPlayer: false, noRows: false },
    finalize: rankByCodScore,
    winner: { by: "highest", stat: "COD_SCORE" },
  },
  {
    gameId: 6,
    name: "Marvel Rivals",
    input: { layout: "solo" },
    review: { unreadableStat: true, unknownPlayer: true, noRows: true },
    // The scoreboard doesn't show which side won, so the import proposes the
    // top fragger. The form allows no winner for this game, so an admin can
    // clear it (e.g. when the whole squad lost).
    winner: { by: "highest", stat: "MR_KILLS" },
  },
];

/** The spec for a games.game_id. Throws for a game with no processor. */
export function getGameProcessorSpec(gameId: number): GameProcessorSpec {
  const spec = GAME_PROCESSOR_SPECS.find((s) => s.gameId === gameId);
  if (!spec) throw new Error(`Invalid game id: ${gameId}`);
  return spec;
}
