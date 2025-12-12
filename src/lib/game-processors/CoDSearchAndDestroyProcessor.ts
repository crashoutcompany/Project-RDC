import {
  AnalyzedPlayersObj,
  AnalyzedTeamData,
} from "@/app/actions/visionAction";
import { VisionPlayer, VisionResult } from "../../lib/visionTypes";
import {
  calculateTeamWinners,
  GameProcessor,
  isAnalyzedTeamDataArray,
  processPlayer,
  validateProcessedPlayer,
  WinnerConfig,
  validateResults,
} from "./game-processor-utils";
import { Player } from "@/generated/prisma/client";

export const CoDSearchAndDestroyProcessor: GameProcessor = {
  processPlayers: function (
    codPlayers: AnalyzedPlayersObj[] | AnalyzedTeamData[],
    sessionPlayers: Player[],
  ) {
    console.log("Processing CoD Search and Destroy Players: ", codPlayers);

    const codVisionResult: VisionResult = {
      players: [],
    };
    let requiresCheck = false;

    // For Search and Destroy, we expect team data since players are on the same team
    if (isAnalyzedTeamDataArray(codPlayers)) {
      // Process team data - assuming we're only processing one team
      codPlayers.forEach((teamData) => {
        console.log(`Processing Team: ${teamData.teamName}`);

        if (teamData.players.valueArray) {
          teamData.players.valueArray.forEach((player) => {
            const processedPlayer = processPlayer(player, teamData.teamName);
            const validatedPlayer = validateProcessedPlayer(
              processedPlayer,
              sessionPlayers,
            );
            if (!validatedPlayer) {
              console.error("Player validation failed: ", processedPlayer);
              requiresCheck = true;
              return;
            }
            console.log("Successfully validated player: ", validatedPlayer);
            codVisionResult.players.push(validatedPlayer);

            // Check if any player required validation
            if (processedPlayer.reqCheckFlag) {
              requiresCheck = true;
            }
          });
        }
      });
    } else {
      // Handle individual player data format (fallback)
      console.log("Processing individual player data for Search and Destroy");
      const fallbackPlayers = codPlayers[0]?.valueArray ?? [];
      fallbackPlayers.forEach((player) => {
        const processedPlayer = processPlayer(player, "TEAM");
        const validatedPlayer = validateProcessedPlayer(
          processedPlayer,
          sessionPlayers,
        );
        if (!validatedPlayer) {
          console.error("Player validation failed: ", processedPlayer);
          requiresCheck = true;
          return;
        }
        console.log("Successfully validated player: ", validatedPlayer);
        codVisionResult.players.push(validatedPlayer);

        // Check if any player required validation
        if (processedPlayer.reqCheckFlag) {
          requiresCheck = true;
        }
      });
    }

    // No ranking for Search and Destroy since players are on the same team
    console.log(
      "Processed Search and Destroy players: ",
      codVisionResult.players,
    );

    return {
      processedPlayers: codVisionResult.players,
      reqCheckFlag: requiresCheck,
    };
  },
  calculateWinners: (players: VisionPlayer[]): VisionPlayer[] => {
    // For Search and Destroy, we can determine winners by team performance
    // Since we're processing one team, we could return all players as winners
    // or determine based on specific criteria
    const config: WinnerConfig = {
      type: "TEAM",
      winCondition: {
        statName: "COD_SCORE",
        comparison: "sum",
      },
    };
    console.log(
      "Calculating CoD Search and Destroy winners config: ",
      config,
      "players: ",
      players,
    );

    // Since we're only processing one team, return all players as potential winners
    // The actual winner determination might be based on external factors (round wins, etc.)
    return calculateTeamWinners(players, "TEAM", config);
  },
  validateStats: (statValue: string | undefined) => {
    if (statValue === undefined) {
      console.error("Stat value is undefined");
      return { statValue: "0", reqCheck: true };
    }
    return { statValue, reqCheck: false };
  },
  validateResults: validateResults,
};
