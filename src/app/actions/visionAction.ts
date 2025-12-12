import { GAME_CONFIGS, VisionResultCodes } from "@/lib/constants";
import DocumentIntelligence, {
  getLongRunningPoller,
  AnalyzeOperationOutput,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { Player } from "@/generated/prisma/client";
import { GameProcessor } from "@/lib/game-processors/game-processor-utils";
import { MarioKart8Processor } from "@/lib/game-processors/MarioKart8Processor";
import { RocketLeagueProcessor } from "@/lib/game-processors/RocketLeagueProcessor";
import { CoDGunGameProcessor } from "@/lib/game-processors/CoDGunGameProcessor";
import { logVisionError, logVisionSuccess } from "@/posthog/server-analytics";
import { after } from "next/server";
import { AnalysisResults, Stat, VisionPlayer } from "@/lib/visionTypes";
import { MarvelRivalsProcessor } from "@/lib/game-processors/MarvelRivalsProcessor";

const client = DocumentIntelligence(
  process.env["NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_ENDPOINT"]!,
  {
    key: process.env["NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_API_KEY"]!,
  },
);

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
 * Analyzes a screenshot using Azure Document Intelligence to extract game stats
 *
 * @description
 * This function:
 * 1. Sends the image to Azure's Document Intelligence API for analysis
 * 2. Processes the response to extract team and player information
 * 3. Validates and normalizes all extracted data
 * 4. Determines match winners based on team scores
 * 5. Flags any potential recognition issues that need manual review
 *
 * @param base64Source - Base64 encoded image data to analyze
 * @param sessionPlayers - Array of valid players in the current session for validation
 * @returns A VisionResult object containing processed data and status information
 * @throws Returns a Failed status with error details if processing fails
 */
export const analyzeScreenShot = async (
  base64Source: string,
  sessionPlayers: Player[] = [],
  gameId: number,
): Promise<AnalysisResults> => {
  const startTime = performance.now();
  try {
    const gameProcessor = getGameProcessor(gameId);
    const gameConfig = GAME_CONFIGS[gameId];

    if (!gameConfig) {
      throw new Error(`Game config not found for gameId: ${gameId}`);
    }

    console.log("Analyzing Screenshot with config: ", gameConfig);

    const response = await client
      .path("/documentModels/{modelId}:analyze", gameConfig.modelId)
      .post({
        contentType: "application/json",
        body: {
          base64Source: base64Source,
        },
        queryParameters: {
          locale: "en-US",
        },
      });

    if (isUnexpected(response)) {
      after(() => logVisionError(response.body.error));
      throw response.body.error;
    }

    const poller = await getLongRunningPoller(client, response);

    const result = (await poller.body) as AnalyzeOperationOutput;

    if (!result.analyzeResult || !result.analyzeResult.documents) {
      return {
        status: VisionResultCodes.Failed,
        message: "Analyze result or documents are undefined",
      };
    }

    // Analyzed Result should differ depdending on model
    // Team based models should return players grouped by team
    // Individual player models should return all players in one array

    // Each player object from appropriate vision model should have all stats associated with players
    // , may or may not be broken up into teams depending on model
    // RL: Blue Team, Orange Team
    // MK: Yoshi, Mario, Luigi, Peach, etc...
    const analyzedPlayers = result.analyzeResult.documents[0].fields;
    // Returns an object containing players (1-grouped by team if applicable)
    console.log("Analyzed Players: ", analyzedPlayers);

    if (!analyzedPlayers) {
      throw new Error("Vision Analysis Player Results are undefined");
    }

    // Go into individual game checks -- if its not a team game we can skip this
    // and just return the players

    let teamsArray: AnalyzedTeamData[] = [];
    let playersData: AnalyzedPlayersObj[] = [];

    if (gameConfig.type === "TEAM") {
      teamsArray = Object.entries(analyzedPlayers).map(
        ([teamName, teamData]) => ({
          teamName,
          players: teamData as unknown as AnalyzedPlayersObj,
        }),
      );
      console.log("Teams Array: ", teamsArray);
    } else {
      playersData = Object.values(
        analyzedPlayers,
      ) as unknown as AnalyzedPlayersObj[];
      console.log("Players Data: ", playersData);
    }

    const processedPlayers = gameProcessor.processPlayers(
      gameConfig.type === "TEAM" ? teamsArray : playersData,
      sessionPlayers,
    );
    console.log("Processed Players: ", processedPlayers);

    const validatedPlayers: VisionPlayer[] =
      processedPlayers.processedPlayers.map((player) => {
        const validatedStats = player.stats.map((stat: Stat) => {
          const validatedStat = gameProcessor.validateStats(
            stat.statValue,
            sessionPlayers.length,
          );

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
      processedPlayers.reqCheckFlag,
    );

    console.log("Teams Array: ", teamsArray);
    console.log("Validated Result: ", validatedResult);

    const duration = performance.now() - startTime;
    after(() => logVisionSuccess(gameId, duration));

    return validatedResult;
  } catch (error) {
    console.error(error);
    const e = error instanceof Error ? error.message : "Unknown error";
    logVisionError(error);
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
