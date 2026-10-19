import { PLAYER_MAPPINGS } from "@/app/(routes)/admin/_utils/player-mappings";
import { VisionResultCodes } from "./constants";

export interface VisionResult {
  players: VisionPlayer[];
  winner?: VisionPlayer[];
}

export type VisionTeam = {
  [key: string]: VisionPlayer[];
};

export interface VisionPlayer {
  playerId?: number;
  teamKey?: string;
  name: keyof typeof PLAYER_MAPPINGS;
  // Stats captured and validated by vision processors, not DB shape
  stats: Stat[];
}

export interface Stat {
  statId: number;
  stat: string;
  statValue: string; // TODO: This should be allowed to be undefined but throw an error maybe?
}

export type AnalysisResults =
  | { status: VisionResultCodes.Success; data: VisionResult; message: string }
  | {
      status: VisionResultCodes.CheckRequest;
      data: VisionResult;
      message: string;
    }
  | { status: VisionResultCodes.Failed; message: string };

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
