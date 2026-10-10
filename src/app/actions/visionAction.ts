import { VisionResultCodes } from "@/lib/constants";
import { Player } from "@/generated/prisma/client";
import { logVisionError, logVisionSuccess } from "@/posthog/server-analytics";
import { after } from "next/server";
import { AnalysisResults } from "@/lib/visionTypes";
import config from "@/lib/config";
import {
  analyzeScoreboard,
  createDocumentIntelligenceClient,
} from "@/lib/vision/analyze-scoreboard";

export { getGameProcessor } from "@/lib/vision/analyze-scoreboard";
export type {
  AnalyzedPlayer,
  AnalyzedTeamData,
  AnalyzedPlayersObj,
} from "@/lib/visionTypes";

const client = createDocumentIntelligenceClient(
  config.DOCUMENT_INTELLIGENCE_ENDPOINT!,
  config.DOCUMENT_INTELLIGENCE_API_KEY!,
);

export const analyzeScreenShot = async (
  base64Source: string,
  sessionPlayers: Player[] = [],
  gameId: number,
): Promise<AnalysisResults> => {
  const startTime = performance.now();
  try {
    const result = await analyzeScoreboard({
      client,
      base64Source,
      sessionPlayers,
      gameId,
    });

    if (result.status !== VisionResultCodes.Failed) {
      const duration = performance.now() - startTime;
      after(() => logVisionSuccess(gameId, duration));
    }

    return result;
  } catch (error) {
    console.error(error);
    const e = error instanceof Error ? error.message : "Unknown error";
    logVisionError(error);
    return { status: VisionResultCodes.Failed, message: e };
  }
};
