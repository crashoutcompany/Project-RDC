"use server";

import { VisionResultCodes, errorCodes } from "@/lib/constants";
import { Player } from "@/generated/prisma/client";
import { analyzeScreenShot } from "@/app/actions/visionAction";
import { VisionResult } from "@/lib/visionTypes";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "prisma/db";

type AdminUser = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>["user"] & { role?: string };

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
    const authUser = await auth.api.getSession({ headers: await headers() });
    const user = authUser?.user as AdminUser | undefined;
    if (!authUser || user?.role !== "admin")
      return {
        status: VisionResultCodes.Failed,
        message: errorCodes.NotAuthenticated,
      };

    if (!base64FileContent?.trim())
      return {
        status: VisionResultCodes.Failed,
        message: "No screenshot provided.",
      };

    if (!gameName?.trim())
      return {
        status: VisionResultCodes.Failed,
        message: "Game name is required.",
      };

    if (!sessionPlayers?.length)
      return {
        status: VisionResultCodes.Failed,
        message: "At least one player is required.",
      };

    const game = await prisma.game.findFirst({
      where: { gameName },
      select: { gameId: true },
    });

    if (!game)
      return {
        status: VisionResultCodes.Failed,
        message: `Unable to find game "${gameName}". Please verify the game name is correct.`,
      };

    const analysisResults = await analyzeScreenShot(
      base64FileContent,
      sessionPlayers,
      game.gameId,
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
