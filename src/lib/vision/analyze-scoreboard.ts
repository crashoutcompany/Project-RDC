import DocumentIntelligence, {
  getLongRunningPoller,
  AnalyzeOperationOutput,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { Player } from "@/generated/prisma/client";
import { gameById } from "@/lib/games";
import { getGameProcessorSpec } from "@/lib/game-processors/game-specs";
import {
  processGameScoreboard,
  type ScoreboardFields,
} from "@/lib/game-processors/process-scoreboard";
import { AnalysisResults, AnalyzedPlayersObj } from "@/lib/visionTypes";

export type { ScoreboardFields };

export type DocumentIntelligenceClient = ReturnType<
  typeof DocumentIntelligence
>;

export const createDocumentIntelligenceClient = (
  endpoint: string,
  key: string,
): DocumentIntelligenceClient => DocumentIntelligence(endpoint, { key });

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
  const game = gameById(gameId);
  if (!game) throw new Error(`Game config not found for gameId: ${gameId}`);

  const response = await client
    .path("/documentModels/{modelId}:analyze", game.azureModelId)
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

  if (game.teams)
    return Object.entries(analyzedPlayers).map(([teamName, teamData]) => ({
      teamName,
      players: teamData as unknown as AnalyzedPlayersObj,
    }));
  return Object.values(analyzedPlayers) as unknown as AnalyzedPlayersObj[];
}

/**
 * Turns per-player fields (from any reader) into the admin form's result:
 * maps gamertags to session players, validates stats, and picks winners with
 * the game's processor spec. Throws for a game that has none.
 *
 * `ocrCorrections` applies the spec's fixes for Azure's known misreads
 * (e.g. MK8 7th -> 1st). They're wrong for readers that don't make those
 * mistakes, so the Gemini reader turns them off.
 */
export function processScoreboard(args: {
  fields: ScoreboardFields;
  gameId: number;
  sessionPlayers: Player[];
  ocrCorrections: boolean;
}): AnalysisResults {
  return processGameScoreboard(getGameProcessorSpec(args.gameId), args);
}
