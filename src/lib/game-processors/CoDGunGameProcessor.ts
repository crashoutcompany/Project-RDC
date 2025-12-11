import {
  AnalyzedPlayersObj,
  AnalyzedTeamData,
} from "@/app/actions/visionAction";
import { VisionPlayer, VisionResult } from "../../lib/visionTypes";
import {
  calculateIndividualWinner,
  GameProcessor,
  isAnalyzedTeamDataArray,
  processPlayer,
  validateProcessedPlayer,
  WinnerConfig,
} from "./game-processor-utils";
import { VisionResultCodes } from "../constants";
import { Player } from "prisma/generated";
import { getStatConfigByFieldKey } from "../stat-configs";

// Helper function to rank players by COD_KILLS and set COD_POS
const rankPlayersByScore = (players: VisionPlayer[]): VisionPlayer[] => {
  // Sort players by COD_KILLS in descending order (highest kills first)
  const sortedPlayers = [...players].sort((a, b) => {
    const aKills = parseInt(
      a.stats.find((stat) => stat.stat === "COD_SCORE")?.statValue || "0",
    );
    const bKills = parseInt(
      b.stats.find((stat) => stat.stat === "COD_SCORE")?.statValue || "0",
    );
    return bKills - aKills;
  });

  // Assign rankings (1-based) and update COD_POS stat
  return sortedPlayers.map((player, index) => {
    const position = index + 1;

    // Check if COD_POS stat already exists
    const existingPosStatIndex = player.stats.findIndex(
      (stat) => stat.stat === "COD_POS",
    );

    if (existingPosStatIndex >= 0) {
      // Update existing COD_POS stat
      player.stats[existingPosStatIndex].statValue = position.toString();
    } else {
      // Add new COD_POS stat
      player.stats.push({
        statId: getStatConfigByFieldKey("cod_pos")?.id || 12, // COD_POS stat ID
        stat: "COD_POS",
        statValue: position.toString(),
      });
    }

    return player;
  });
};

export const CoDGunGameProcessor: GameProcessor = {
  processPlayers: function (
    codPlayers: AnalyzedPlayersObj[] | AnalyzedTeamData[],
    sessionPlayers: Player[],
  ) {
    console.log("Processing CoD Gun Game Players: ", codPlayers);

    const codVisionResult: VisionResult = {
      players: [],
    };
    const requiresCheck = false;

    // TODO: Handle team versus individual typing better
    if (isAnalyzedTeamDataArray(codPlayers)) {
      console.error("Invalid data format for CoD Gun Game players.");
      return { processedPlayers: [], reqCheckFlag: true };
    }

    codPlayers[0].valueArray.forEach((player) => {
      const processedPlayer = processPlayer(player);
      const validatedPlayer = validateProcessedPlayer(
        processedPlayer,
        sessionPlayers,
      );
      if (!validatedPlayer) {
        console.error("Player validation failed: ", processedPlayer);
        return;
      }
      console.log("Successfully validated player: ", validatedPlayer);
      codVisionResult.players.push(validatedPlayer);
    });

    // Rank players by COD_KILLS and set COD_POS
    codVisionResult.players = rankPlayersByScore(codVisionResult.players);
    console.log("Players ranked by kills: ", codVisionResult.players);

    return {
      processedPlayers: codVisionResult.players,
      reqCheckFlag: requiresCheck,
    };
  },
  calculateWinners: (players: VisionPlayer[]): VisionPlayer[] => {
    const config: WinnerConfig = {
      type: "INDIVIDUAL",
      winCondition: {
        statName: "COD_SCORE", // TODO Verify stat name
        comparison: "highest",
      },
    };
    console.log(
      "Calculating CoD Gun Game winners config: ",
      config,
      "players: ",
      players,
    );
    const codWinner = calculateIndividualWinner(players, config);
    console.log("COD Winner", codWinner);
    return codWinner;
  },
  validateStats: (
    statValue: string | undefined,
     
    numPlayers: number | undefined,
  ) => {
    if (statValue === undefined) {
      console.error("Stat value is undefined");
      return { statValue: "0", reqCheck: true };
    }
    return { statValue, reqCheck: false };
  },
  validateResults: (
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
  },
};
