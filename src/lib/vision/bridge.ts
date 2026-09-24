import { GAME_CONFIGS } from "@/lib/constants";
import type {
  AnalyzedPlayer,
  AnalyzedPlayersObj,
  AnalyzedTeamData,
} from "@/app/actions/visionAction";
import type { ExtractedPlayer, ExtractedScoreboard } from "./types";
import { teamKeyToLegacyName } from "./team-keys";

/**
 * Converts a normalized `ExtractedScoreboard` (from any `VisionProvider`)
 * back into the Azure Document Intelligence-shaped types the existing
 * `GameProcessor`s consume, so they run unchanged regardless of which
 * provider produced the data. A follow-up can migrate processors to consume
 * `ExtractedScoreboard` directly and retire this bridge.
 */
export const toLegacyAnalyzed = (
  scoreboard: ExtractedScoreboard,
  gameId: number,
): AnalyzedTeamData[] | AnalyzedPlayersObj[] => {
  const gameConfig = GAME_CONFIGS[gameId];
  if (!gameConfig) throw new Error(`Unknown gameId for vision: ${gameId}`);

  if (gameConfig.type === "TEAM") {
    const teams = scoreboard.teams ?? [];
    return teams.map(
      (team): AnalyzedTeamData => ({
        teamName: teamKeyToLegacyName(gameId, team.teamKey),
        players: toAnalyzedPlayersObj(team.players),
      }),
    );
  }

  // SOLO games: existing processors only ever read the first array field
  // (see e.g. MarioKart8Processor: `mk8Players[0].valueArray`), so all
  // players are wrapped into a single field here.
  return [toAnalyzedPlayersObj(scoreboard.players ?? [])];
};

const toAnalyzedPlayersObj = (
  players: ExtractedPlayer[],
): AnalyzedPlayersObj => ({
  type: "array",
  valueArray: players.map(toAnalyzedPlayer),
});

const toAnalyzedPlayer = (player: ExtractedPlayer): AnalyzedPlayer => {
  const confidence = player.confidence ?? 1;
  const valueObject: AnalyzedPlayer["valueObject"] = {
    PlayerName: {
      type: "string",
      content: player.name,
      valueString: player.name,
      confidence,
    },
  };

  for (const [fieldKey, value] of Object.entries(player.stats)) {
    valueObject[fieldKey] = {
      type: "string",
      content: String(value),
      valueString: String(value),
      confidence,
    };
  }

  return { type: "object", valueObject };
};
