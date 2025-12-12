import {
  AnalyzedPlayersObj,
  AnalyzedTeamData,
} from "@/app/actions/visionAction";
import { VisionResult, VisionPlayer } from "../visionTypes";
import { Player } from "@/generated/prisma/client";
import {
  GameProcessor,
  isAnalyzedTeamDataArray,
  processPlayer,
  validateProcessedPlayer,
  WinnerConfig,
  calculateIndividualWinner,
  validateResults,
} from "./game-processor-utils";

// Vision Processor sometimes mistakes a 1 for a 7, so we need to validate the stat value
const validateMKStatValue = (
  statValue: string | undefined,
  numPlayers: number | undefined,
) => {
  if (!statValue) {
    return { statValue: "0", reqCheck: true };
  }

  const numericValue = parseInt(statValue);
  console.log("Parsed numeric value: ", numericValue);
  if (isNaN(numericValue)) {
    console.log(`Invalid numeric value: ${statValue}`);
    return { statValue: "0", reqCheck: true };
  }

  if (numericValue === 7 && numPlayers! < 7) {
    console.log(`Converting position 7 to 1 (numPlayers=${numPlayers})`);
    return { statValue: "1", reqCheck: true };
  }

  console.log(`Validation successful: ${statValue}`);
  return { statValue, reqCheck: false };
};

export const MarioKart8Processor: GameProcessor = {
  processPlayers: function (
    mk8Players: AnalyzedPlayersObj[] | AnalyzedTeamData[],
    sessionPlayers: Player[],
  ) {
    console.log("Processing MK8 Players: ", mk8Players);

    const mk8VisionResult: VisionResult = {
      players: [],
    };
    let requiresCheck = false;

    if (isAnalyzedTeamDataArray(mk8Players)) {
      console.error("Invalid data format for MK8 players.");
      return { processedPlayers: [], reqCheckFlag: true };
    }

    mk8Players[0].valueArray.forEach((player) => {
      console.log("Processing Player: ", player);
      const processedPlayer = processPlayer(player);
      if (processedPlayer.reqCheckFlag) {
        requiresCheck = true;
        console.warn("Player requires check: ", processedPlayer);
      }
      const validatedPlayer = validateProcessedPlayer(
        processedPlayer,
        sessionPlayers,
      );
      if (!validatedPlayer) {
        console.error("Player validation failed: ", processedPlayer);
        return;
      }
      console.log("Successfuly validated player: ", validatedPlayer);
      mk8VisionResult.players.push(validatedPlayer);
    });

    return {
      processedPlayers: mk8VisionResult.players,
      reqCheckFlag: requiresCheck,
    };
  },
  calculateWinners: function (players: VisionPlayer[]): VisionPlayer[] {
    const config: WinnerConfig = {
      type: "INDIVIDUAL",
      winCondition: {
        statName: "MK8_POS",
        comparison: "lowest",
      },
    };
    console.log(
      "Calculating MK8 winners config: ",
      config,
      "players: ",
      players,
    );
    const mk8Winners = calculateIndividualWinner(players, config);
    console.log("MK8 Winners: ", mk8Winners);
    return mk8Winners;
  },
  validateStats: validateMKStatValue,
  validateResults,
};
