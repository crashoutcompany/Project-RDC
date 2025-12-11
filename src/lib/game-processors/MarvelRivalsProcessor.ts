import {
  AnalyzedPlayersObj,
  AnalyzedTeamData,
} from "@/app/actions/visionAction";
import { Player } from "prisma/generated";
import {
  GameProcessor,
  isAnalyzedTeamDataArray,
  processPlayer,
  validateProcessedPlayer,
} from "./game-processor-utils";
import { VisionPlayer, VisionResult } from "../visionTypes";
import { VisionResultCodes } from "../constants";

const processMarvelRivalsPlayers = (
  mrPlayers: AnalyzedPlayersObj[] | AnalyzedTeamData[],
  sessionPlayers: Player[],
): { processedPlayers: VisionPlayer[]; reqCheckFlag: boolean } => {
  console.log("Processing Marvel Rivals Players: ", mrPlayers);

  const mrVisionResult: VisionResult = {
    players: [],
  };
  let requiresCheck = false;

  if (isAnalyzedTeamDataArray(mrPlayers)) {
    console.error("Invalid data format for Marvel Rivals players.");
    return { processedPlayers: [], reqCheckFlag: true };
  }

  const playerContainer = mrPlayers[0];
  if (!playerContainer?.valueArray?.length) {
    console.error("No Marvel Rivals player data detected.");
    return { processedPlayers: [], reqCheckFlag: true };
  }

  for (const player of playerContainer.valueArray) {
    console.log("Player before processing: ", player);
    const processedPlayer = processPlayer(player);
    if (processedPlayer.reqCheckFlag) {
      requiresCheck = true;
    }
    const validatedPlayer = validateProcessedPlayer(
      processedPlayer,
      sessionPlayers,
    );
    if (!validatedPlayer) {
      console.error("Player validation failed: ", processedPlayer);
      requiresCheck = true;
      continue;
    }
    console.log("Successfully validated player: ", validatedPlayer);
    mrVisionResult.players.push(validatedPlayer);
  }

  return {
    processedPlayers: mrVisionResult.players,
    reqCheckFlag: requiresCheck,
  };
};

const calculateMarvelRivalsWinners = (
  players: VisionPlayer[],
): VisionPlayer[] => {
  console.log("Calculating Marvel Rivals winners from players: ", players);
  return [];
};

const validateResults = (
  visionPlayers: VisionPlayer[],
  visionWinners: VisionPlayer[],
  requiresCheck: boolean,
) => {
  return requiresCheck
    ? {
        status: VisionResultCodes.CheckRequest,
        data: { players: visionPlayers, winner: visionWinners },
        message:
          "There was some trouble processing some stats. They have been assigned the most probable value but please check to ensure all stats are correct before submitting.",
      }
    : {
        status: VisionResultCodes.Success,
        data: { players: visionPlayers, winner: visionWinners },
        message: "Results have been successfully imported.",
      };
};

const validateMarvelRivalsStatValue = (
  statValue: string | undefined,
   
  numPlayers: number | undefined,
) => {
  if (statValue === undefined) {
    console.error("Stat value is undefined");
    return { statValue: "0", reqCheck: true };
  }
  return { statValue, reqCheck: false };
};

export const MarvelRivalsProcessor: GameProcessor = {
  processPlayers: processMarvelRivalsPlayers,
  calculateWinners: calculateMarvelRivalsWinners,
  validateResults: validateResults,
  validateStats: validateMarvelRivalsStatValue,
};
