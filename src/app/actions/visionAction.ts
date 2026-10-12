import { VisionResultCodes } from "@/lib/constants";
import { Player } from "@/generated/prisma/client";
import { logVisionError, logVisionSuccess } from "@/posthog/server-analytics";
import { after } from "next/server";
import { AnalysisResults } from "@/lib/visionTypes";
import config from "@/lib/config";
import { azureReader, geminiReader, readWithFallback } from "@/lib/vision/readers";

export { getGameProcessor } from "@/lib/vision/analyze-scoreboard";
export type {
  AnalyzedPlayer,
  AnalyzedTeamData,
  AnalyzedPlayersObj,
} from "@/lib/visionTypes";

// Gemini reads first; Azure's trained models answer only when Gemini fails
// (after retrying 429s/5xx) or doesn't support the game yet.
const readers = [
  geminiReader({ apiKey: config.GOOGLE_GENERATIVE_AI_API_KEY }),
  azureReader({
    endpoint: config.DOCUMENT_INTELLIGENCE_ENDPOINT,
    key: config.DOCUMENT_INTELLIGENCE_API_KEY,
  }),
];

/**
 * Schedules a log write to run after the response. If after() can't be used
 * (called outside a request scope, or not mocked in a test) the write runs
 * directly, so a logging failure never changes what the action returns.
 */
const logInBackground = (task: () => Promise<unknown>) => {
  // async, so nothing here can throw synchronously, even if task itself does.
  const run = async () => {
    try {
      await task();
    } catch (err) {
      console.error("[vision] logging failed", err);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
};

export const analyzeScreenShot = async (
  base64Source: string,
  sessionPlayers: Player[] = [],
  gameId: number,
): Promise<AnalysisResults> => {
  const startTime = performance.now();
  try {
    const { result, readerId, fallbacks } = await readWithFallback(
      readers,
      { base64Source, sessionPlayers, gameId },
      {
        onFallback: (f) =>
          console.warn(`[vision] ${f.from} failed for game ${gameId}: ${f.reason}`),
      },
    );

    const reader = {
      readerId,
      fallbacks: fallbacks.map((f) => `${f.from}: ${f.reason}`),
    };
    if (result.status !== VisionResultCodes.Failed) {
      const duration = performance.now() - startTime;
      logInBackground(() => logVisionSuccess(gameId, duration, reader));
    } else {
      logInBackground(() => logVisionError(new Error(result.message), reader));
    }

    return result;
  } catch (error) {
    console.error(error);
    const e = error instanceof Error ? error.message : "Unknown error";
    logInBackground(() => logVisionError(error));
    return { status: VisionResultCodes.Failed, message: e };
  }
};
