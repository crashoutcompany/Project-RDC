import DocumentIntelligence, {
  getLongRunningPoller,
  AnalyzeOperationOutput,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { Player } from "@/generated/prisma/client";
import { GAME_CONFIGS, VisionResultCodes } from "@/lib/constants";
import { GameProcessor } from "@/lib/game-processors/game-processor-utils";
import { MarioKart8Processor } from "@/lib/game-processors/MarioKart8Processor";
import { RocketLeagueProcessor } from "@/lib/game-processors/RocketLeagueProcessor";
import { CoDGunGameProcessor } from "@/lib/game-processors/CoDGunGameProcessor";
import { MarvelRivalsProcessor } from "@/lib/game-processors/MarvelRivalsProcessor";
import {
  AnalysisResults,
  AnalyzedPlayersObj,
  AnalyzedTeamData,
  Stat,
  VisionPlayer,
} from "@/lib/visionTypes";

export type DocumentIntelligenceClient = ReturnType<
  typeof DocumentIntelligence
>;

export const createDocumentIntelligenceClient = (
  endpoint: string,
  key: string,
): DocumentIntelligenceClient => DocumentIntelligence(endpoint, { key });

export const getGameProcessor = (gameId: number): GameProcessor => {
  switch (gameId) {
    case 1:
      return MarioKart8Processor;
    case 2:
      return RocketLeagueProcessor;
    case 3:
      return CoDGunGameProcessor;
    case 6:
      return MarvelRivalsProcessor;
    default:
      throw new Error(`Invalid game id: ${gameId}`);
  }
};

/**
 * Runs a scoreboard screenshot through the game's custom Azure Document
 * Intelligence model and the matching game processor.
 *
 * Free of Next.js runtime helpers (`after`, PostHog, `server-only`) so the
 * admin server action and the offline harvester script share one code path.
 * Throws on Azure/processor errors; callers decide how to log and report.
 */
export async function analyzeScoreboard(args: {
  client: DocumentIntelligenceClient;
  base64Source: string;
  sessionPlayers: Player[];
  gameId: number;
}): Promise<AnalysisResults> {
  const { client, base64Source, sessionPlayers, gameId } = args;
  const gameProcessor = getGameProcessor(gameId);
  const gameConfig = GAME_CONFIGS[gameId];

  if (!gameConfig) throw new Error(`Game config not found for gameId: ${gameId}`);

  const response = await client
    .path("/documentModels/{modelId}:analyze", gameConfig.modelId)
    .post({
      contentType: "application/json",
      body: { base64Source },
      queryParameters: { locale: "en-US" },
    });

  if (isUnexpected(response)) throw response.body.error;

  const poller = await getLongRunningPoller(client, response);
  const result = (await poller.body) as AnalyzeOperationOutput;

  if (!result.analyzeResult || !result.analyzeResult.documents)
    return {
      status: VisionResultCodes.Failed,
      message: "Analyze result or documents are undefined",
    };

  // Team models (RL) return one array field per team; solo models (MK8, COD)
  // return every player in a single array field.
  const analyzedPlayers = result.analyzeResult.documents[0].fields;
  if (!analyzedPlayers)
    throw new Error("Vision Analysis Player Results are undefined");

  let teamsArray: AnalyzedTeamData[] = [];
  let playersData: AnalyzedPlayersObj[] = [];

  if (gameConfig.type === "TEAM")
    teamsArray = Object.entries(analyzedPlayers).map(([teamName, teamData]) => ({
      teamName,
      players: teamData as unknown as AnalyzedPlayersObj,
    }));
  else
    playersData = Object.values(
      analyzedPlayers,
    ) as unknown as AnalyzedPlayersObj[];

  const processedPlayers = gameProcessor.processPlayers(
    gameConfig.type === "TEAM" ? teamsArray : playersData,
    sessionPlayers,
  );

  // Game-specific corrections (e.g. MK8 7th -> 1st) must still flag review.
  let statsRequireCheck = false;
  const validatedPlayers: VisionPlayer[] =
    processedPlayers.processedPlayers.map((player) => {
      const validatedStats = player.stats.map((stat: Stat) => {
        const validatedStat = gameProcessor.validateStats(
          stat.statValue,
          sessionPlayers.length,
        );
        if (validatedStat.reqCheck) statsRequireCheck = true;

        return { ...stat, statValue: validatedStat.statValue };
      });

      return { ...player, stats: validatedStats };
    });

  const winners = gameProcessor.calculateWinners(validatedPlayers);

  return gameProcessor.validateResults(
    validatedPlayers,
    winners,
    processedPlayers.reqCheckFlag || statsRequireCheck,
  );
}
