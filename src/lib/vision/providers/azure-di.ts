import "server-only";
import DocumentIntelligence, {
  getLongRunningPoller,
  AnalyzeOperationOutput,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { GAME_CONFIGS } from "@/lib/constants";
import config from "@/lib/config";
import type {
  AnalyzedPlayer,
  AnalyzedPlayersObj,
} from "@/app/actions/visionAction";
import type {
  ExtractedPlayer,
  ExtractedScoreboard,
  VisionExtractInput,
  VisionProvider,
} from "../types";
import { legacyNameToTeamKey } from "../team-keys";

const ANALYZE_TIMEOUT_MS = 30_000;

type DocumentIntelligenceClient = ReturnType<typeof DocumentIntelligence>;

let client: DocumentIntelligenceClient | undefined;

/** Built on first use, not at module load — avoids `!`-asserting env vars that may be unset. */
const getClient = (): DocumentIntelligenceClient => {
  if (client) return client;

  const endpoint = config.DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = config.DOCUMENT_INTELLIGENCE_API_KEY;
  if (!endpoint || !apiKey) {
    throw new Error(
      "Azure Document Intelligence is not configured: set DOCUMENT_INTELLIGENCE_ENDPOINT and DOCUMENT_INTELLIGENCE_API_KEY.",
    );
  }

  client = DocumentIntelligence(endpoint, { key: apiKey });
  return client;
};

const fromAnalyzedPlayer = (player: AnalyzedPlayer): ExtractedPlayer => {
  const stats: Record<string, string | number> = {};
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const [fieldName, field] of Object.entries(player.valueObject)) {
    if (fieldName === "PlayerName") continue;
    stats[fieldName.toLowerCase()] = field.content;
    confidenceSum += field.confidence;
    confidenceCount += 1;
  }

  return {
    name: player.valueObject?.PlayerName?.content || "Unknown",
    stats,
    confidence: confidenceCount ? confidenceSum / confidenceCount : undefined,
  };
};

export const azureDocumentIntelligenceProvider: VisionProvider = {
  id: "azure-di",
  extract: async ({
    imageBase64,
    gameId,
  }: VisionExtractInput): Promise<ExtractedScoreboard> => {
    const gameConfig = GAME_CONFIGS[gameId];
    if (!gameConfig) throw new Error(`Unknown gameId for vision: ${gameId}`);

    const diClient = getClient();

    const response = await diClient
      .path("/documentModels/{modelId}:analyze", gameConfig.modelId)
      .post({
        contentType: "application/json",
        body: { base64Source: imageBase64 },
        queryParameters: { locale: "en-US" },
        abortSignal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS),
      });

    if (isUnexpected(response)) throw response.body.error;

    const poller = await getLongRunningPoller(diClient, response);
    const result = (await poller.body) as AnalyzeOperationOutput;

    const analyzedFields = result.analyzeResult?.documents?.[0]?.fields;
    if (!analyzedFields)
      throw new Error("Vision analysis returned no document fields");

    if (gameConfig.type === "TEAM") {
      return {
        teams: Object.entries(analyzedFields).map(
          ([teamName, teamField]) => ({
            teamKey: legacyNameToTeamKey(gameId, teamName),
            players: (
              teamField as unknown as AnalyzedPlayersObj
            ).valueArray.map(fromAnalyzedPlayer),
          }),
        ),
      };
    }

    // SOLO games: the custom model puts every player under a single array
    // field (see MarioKart8Processor, which only ever reads index 0).
    const [firstField] = Object.values(analyzedFields);
    const players = (
      firstField as unknown as AnalyzedPlayersObj | undefined
    )?.valueArray.map(fromAnalyzedPlayer);

    return { players: players ?? [] };
  },
};
