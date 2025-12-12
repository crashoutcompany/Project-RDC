import {
  AnalyzedTeamData,
  AnalyzedPlayersObj,
} from "@/app/actions/visionAction";
import { VisionPlayer, VisionResult } from "../visionTypes";
import { Player } from "@/generated/prisma/client";
import { RL_TEAM_MAPPING, VisionResultCodes } from "../constants";
import {
  GameProcessor,
  isAnalyzedTeamDataArray,
  processTeam,
  WinnerConfig,
  calculateTeamWinners,
} from "./game-processor-utils";

export const RocketLeagueProcessor: GameProcessor = {
  processPlayers: function (
    rlTeams: AnalyzedTeamData[] | AnalyzedPlayersObj[],
    sessionPlayers: Player[],
  ) {
    const rocketLeagueVisionResult: VisionResult = {
      players: [],
    };
    let requiresCheck = false;

    console.log("Processing Rocket League Players: ", rlTeams);

    if (!isAnalyzedTeamDataArray(rlTeams)) {
      console.error("Invalid data format for Rocket League players.");
      return { processedPlayers: [], reqCheckFlag: true };
    }
    rlTeams.forEach((teamData) => {
      const teamColor =
        RL_TEAM_MAPPING[teamData.teamName as keyof typeof RL_TEAM_MAPPING];
      console.log(`Processing Team: ${teamColor}`);
      console.log("Team Data: ", teamData);

      if (teamColor) {
        const { processedPlayers, reqCheckFlag } = processTeam(
          teamData,
          sessionPlayers,
        );

        console.log(`Processed Player for: ${teamColor}:`, processedPlayers);
        rocketLeagueVisionResult.players.push(...processedPlayers);
        requiresCheck = requiresCheck || reqCheckFlag;
      }
    });

    return {
      processedPlayers: rocketLeagueVisionResult.players,
      reqCheckFlag: requiresCheck,
    };
  },

  calculateWinners: (players: VisionPlayer[]): VisionPlayer[] => {
    const config: WinnerConfig = {
      type: "TEAM",
      winCondition: {
        statName: "RL_GOALS",
        comparison: "sum",
      },
    };
    return calculateTeamWinners(players, "TEAM", config);
  },

  validateStats: (statValue: string | undefined) => {
    if (statValue === "Z" || statValue === "Ø") {
      return { statValue: "0", reqCheck: true };
    } else if (statValue === undefined) {
      return { statValue: "0", reqCheck: true };
    } else {
      return { statValue: statValue, reqCheck: false };
    }
  },
  // Should be validateRLStatValue

  validateResults: (
    visionPlayers: VisionPlayer[],
    visionWinners: VisionPlayer[],
    requiresCheck: boolean,
  ) => {
    // VisionResult AKA data is  passed into HandleCreateMatchFromVision
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
