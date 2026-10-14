import DocumentIntelligence, {
  getLongRunningPoller,
  AnalyzeOperationOutput,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { Player } from "@/generated/prisma/client";
import { GAME_CONFIGS } from "@/lib/constants";
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

/** Per-player fields in Azure's layout: one array per team, or a single array for solo games. */
export type ScoreboardFields = AnalyzedTeamData[] | AnalyzedPlayersObj[];

/**
 * Reads a screenshot with the game's custom Azure Document Intelligence model.
 * Returns null when Azure answers with no document. Throws on API errors.
 */
export async function extractWithAzure(args: {
  client: DocumentIntelligenceClient;
  base64Source: string;
  gameId: number;
}): Promise<ScoreboardFields | null> {
  const { client, base64Source, gameId } = args;
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
  if (!result.analyzeResult || !result.analyzeResult.documents) return null;

  // Team models (RL) return one array field per team; solo models (MK8, COD)
  // return every player in a single array field.
  const analyzedPlayers = result.analyzeResult.documents[0].fields;
  if (!analyzedPlayers)
    throw new Error("Vision Analysis Player Results are undefined");

  if (gameConfig.type === "TEAM")
    return Object.entries(analyzedPlayers).map(([teamName, teamData]) => ({
      teamName,
      players: teamData as unknown as AnalyzedPlayersObj,
    }));
  return Object.values(analyzedPlayers) as unknown as AnalyzedPlayersObj[];
}

/**
 * Turns per-player fields (from any reader) into the admin form's result:
 * maps gamertags to session players, validates stats, and picks winners with
 * the game's processor.
 *
 * `ocrCorrections` applies the processor's fixes for Azure's known misreads
 * (e.g. MK8 7th -> 1st). They're wrong for readers that don't make those
 * mistakes, so the Gemini reader turns them off.
 */
export function processScoreboard(args: {
  fields: ScoreboardFields;
  gameId: number;
  sessionPlayers: Player[];
  ocrCorrections: boolean;
}): AnalysisResults {
  const { fields, gameId, sessionPlayers, ocrCorrections } = args;
  const gameProcessor = getGameProcessor(gameId);
  const processedPlayers = gameProcessor.processPlayers(fields, sessionPlayers);

  // Game-specific corrections (e.g. MK8 7th -> 1st) must still flag review.
  let statsRequireCheck = false;
  const validatedPlayers: VisionPlayer[] = ocrCorrections
    ? processedPlayers.processedPlayers.map((player) => {
        const validatedStats = player.stats.map((stat: Stat) => {
          const validatedStat = gameProcessor.validateStats(
            stat.statValue,
            sessionPlayers.length,
          );
          if (validatedStat.reqCheck) statsRequireCheck = true;

          return { ...stat, statValue: validatedStat.statValue };
        });

        return { ...player, stats: validatedStats };
      })
    : processedPlayers.processedPlayers;

  const winners = gameProcessor.calculateWinners(validatedPlayers);

  return gameProcessor.validateResults(
    validatedPlayers,
    winners,
    processedPlayers.reqCheckFlag || statsRequireCheck,
  );
}
