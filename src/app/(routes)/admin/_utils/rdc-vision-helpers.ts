"use server";

import { VisionResultCodes } from "@/lib/constants";
import { Player } from "@/generated/prisma/client";
import { analyzeScreenShot } from "@/app/actions/visionAction";
import { getGameIdFromName } from "@/app/actions/adminAction";
import { VisionResult } from "@/lib/visionTypes";

/**x
 * Handles the analysis of a screenshot using vision recognition
 *
 * @description
 * This function orchestrates the vision analysis process:
 * 1. Converts selected file to base64 format
 * 2. Sends image for vision analysis
 * 3. Returns results for the client to handle
 *
 * @param state - Current state of the vision analysis UI
 * @param sessionPlayers - Array of players in the current session for validation
 * @returns Promise that resolves with the vision analysis results
 */
export const handleAnalyzeBtnClick = async (
  base64FileContent: string,
  sessionPlayers: Player[],
  gameName: string,
): Promise<FnReturnType> => {
  try {
    // Get game ID with error handling
    let gameId: number;
    try {
      gameId = await getGameIdFromName(gameName);
      if (!gameId) {
        throw new Error(`Game "${gameName}" not found`);
      }
    } catch (error) {
      console.error("Failed to get game ID:", error);
      return {
        status: VisionResultCodes.Failed,
        message: `Unable to find game "${gameName}". Please verify the game name is correct.`,
      };
    }

    const analysisResults = await analyzeScreenShot(
      base64FileContent,
      sessionPlayers,
      gameId, // TODO: This should be from the selected game
    );

    console.log("Analysis results", { analysisResults });

    switch (analysisResults.status) {
      case VisionResultCodes.Success:
        return {
          status: VisionResultCodes.Success,
          data: analysisResults.data,
          message: "Analysis completed successfully.",
        };
      case VisionResultCodes.CheckRequest:
        return {
          status: VisionResultCodes.CheckRequest,
          data: analysisResults.data,
          message: "Analysis requires further review.",
        };
      case VisionResultCodes.Failed:
        return {
          status: VisionResultCodes.Failed,
          message: analysisResults.message || "Analysis failed.",
        };
      default:
        return {
          status: VisionResultCodes.Failed,
          message: "Unknown analysis status.",
        };
    }
  } catch (error) {
    console.error("Error in handleAnalyzeBtnClick: ", error);
    return {
      status: VisionResultCodes.Failed,
      message: "An unexpected error occurred during analysis.",
    };
  }
};

type FnReturnType =
  | {
      status: VisionResultCodes.CheckRequest;
      data: VisionResult;
      message: string;
    }
  | {
      status: VisionResultCodes.Success;
      data: VisionResult;
      message: string;
    }
  | {
      status: VisionResultCodes.Failed;
      message: string;
    };
