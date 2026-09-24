import type { Player } from "@/generated/prisma/client";
import { GAME_CONFIGS, VisionResultCodes } from "@/lib/constants";
import { getGameProcessor } from "@/app/actions/visionAction";
import { buildRosterHint, getVisionProvider, toLegacyAnalyzed } from "@/lib/vision";
import type { Stat } from "@/lib/visionTypes";

export interface CaseResult {
  status: string;
  message?: string;
  players?: { name: string; stats: Stat[] }[];
  winners?: string[];
  durationMs: number;
}

/**
 * Mirrors `analyzeScreenShot`'s pipeline (provider -> bridge -> processor)
 * without its `after()`/PostHog calls, which need an active Next.js request
 * scope that a bare CLI script never has. Keep this in sync with
 * `src/app/actions/visionAction.ts` if that orchestration changes.
 */
export const runVisionCase = async (
  imageBase64: string,
  gameId: number,
  sessionPlayers: Player[],
): Promise<CaseResult> => {
  const startTime = performance.now();
  try {
    const gameProcessor = getGameProcessor(gameId);
    if (!GAME_CONFIGS[gameId]) {
      throw new Error(`Game config not found for gameId: ${gameId}`);
    }

    const provider = getVisionProvider();
    const scoreboard = await provider.extract({
      imageBase64,
      gameId,
      rosterHint: buildRosterHint(sessionPlayers),
    });

    const legacyData = toLegacyAnalyzed(scoreboard, gameId);
    const processedPlayers = gameProcessor.processPlayers(
      legacyData,
      sessionPlayers,
    );

    let statsReqCheck = false;
    const validatedPlayers = processedPlayers.processedPlayers.map(
      (player) => {
        const validatedStats = player.stats.map((stat: Stat) => {
          const validatedStat = gameProcessor.validateStats(
            stat.statValue,
            sessionPlayers.length,
          );
          if (validatedStat.reqCheck) statsReqCheck = true;
          return { ...stat, statValue: validatedStat.statValue };
        });
        return { ...player, stats: validatedStats };
      },
    );

    const winners = gameProcessor.calculateWinners(validatedPlayers);
    const result = gameProcessor.validateResults(
      validatedPlayers,
      winners,
      processedPlayers.reqCheckFlag || statsReqCheck,
    );

    const durationMs = performance.now() - startTime;

    if (result.status === VisionResultCodes.Failed) {
      return { status: result.status, message: result.message, durationMs };
    }

    return {
      status: result.status,
      message: result.message,
      players: result.data.players.map((p) => ({ name: p.name, stats: p.stats })),
      winners: (result.data.winner ?? []).map((w) => w.name),
      durationMs,
    };
  } catch (error) {
    return {
      status: VisionResultCodes.Failed,
      message: error instanceof Error ? error.message : String(error),
      durationMs: performance.now() - startTime,
    };
  }
};
