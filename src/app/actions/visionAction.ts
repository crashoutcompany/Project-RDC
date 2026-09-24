import { GAME_CONFIGS, VisionResultCodes } from "@/lib/constants";
import { Player } from "@/generated/prisma/client";
import { GameProcessor } from "@/lib/game-processors/game-processor-utils";
import { MarioKart8Processor } from "@/lib/game-processors/MarioKart8Processor";
import { RocketLeagueProcessor } from "@/lib/game-processors/RocketLeagueProcessor";
import { CoDGunGameProcessor } from "@/lib/game-processors/CoDGunGameProcessor";
import { logVisionError, logVisionSuccess } from "@/posthog/server-analytics";
import { after } from "next/server";
import { AnalysisResults, Stat, VisionPlayer } from "@/lib/visionTypes";
import { MarvelRivalsProcessor } from "@/lib/game-processors/MarvelRivalsProcessor";
import {
  buildRosterHint,
  getVisionProvider,
  toLegacyAnalyzed,
} from "@/lib/vision";

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

export const analyzeScreenShot = async (
  base64Source: string,
  sessionPlayers: Player[] = [],
  gameId: number,
): Promise<AnalysisResults> => {
  const startTime = performance.now();
  let providerId = "unknown";
  try {
    const gameProcessor = getGameProcessor(gameId);
    const gameConfig = GAME_CONFIGS[gameId];

    if (!gameConfig) {
      throw new Error(`Game config not found for gameId: ${gameId}`);
    }

    const provider = getVisionProvider();
    providerId = provider.id;

    const scoreboard = await provider.extract({
      imageBase64: base64Source,
      gameId,
      rosterHint: buildRosterHint(sessionPlayers),
    });
    console.log("Extracted scoreboard: ", scoreboard);

    // Translated back to the Azure-shaped types
    const legacyData = toLegacyAnalyzed(scoreboard, gameId);

    const processedPlayers = gameProcessor.processPlayers(
      legacyData,
      sessionPlayers,
    );
    console.log("Processed Players: ", processedPlayers);

    let statsReqCheck = false;
    const validatedPlayers: VisionPlayer[] =
      processedPlayers.processedPlayers.map((player) => {
        const validatedStats = player.stats.map((stat: Stat) => {
          const validatedStat = gameProcessor.validateStats(
            stat.statValue,
            sessionPlayers.length,
          );
          if (validatedStat.reqCheck) statsReqCheck = true;

          return {
            ...stat,
            statValue: validatedStat.statValue,
          };
        });

        return {
          ...player,
          stats: validatedStats,
        };
      });

    const winners = gameProcessor.calculateWinners(validatedPlayers);
    console.log("Winners: ", winners);

    const validatedResult: AnalysisResults = gameProcessor.validateResults(
      validatedPlayers,
      winners,
      processedPlayers.reqCheckFlag || statsReqCheck,
    );

    console.log("Validated Result: ", validatedResult);

    const duration = performance.now() - startTime;
    after(() => logVisionSuccess(gameId, duration, providerId));

    return validatedResult;
  } catch (error) {
    console.error(error);
    const e = error instanceof Error ? error.message : "Unknown error";
    after(() => logVisionError(error, providerId));
    return { status: VisionResultCodes.Failed, message: e };
  }
};

type PlayerField = {
  type: string;
  content: string;
  valueString?: string;
  valueInteger?: number;
  confidence: number;
};

export type AnalyzedPlayer = {
  type: "object";
  valueObject: {
    [fieldName: string]: PlayerField;
  };
};

export type AnalyzedTeamData = {
  teamName: string;
  players: AnalyzedPlayersObj;
};

export type AnalyzedPlayersObj = {
  type: "array";
  valueArray: AnalyzedPlayer[];
};
