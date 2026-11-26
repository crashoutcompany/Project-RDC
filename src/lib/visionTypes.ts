import { VisionResultCodes } from "./constants";

/** The flag field for a row's player name; stat fields use their StatName. */
export const PLAYER_NAME_FIELD = "PLAYER_NAME";

/**
 * Reads at or above this confidence (0–1) are trusted. Anything lower is
 * flagged for a second look in the admin review queue. A flag is a warning
 * only: it never blocks approval.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.8;

export const isLowConfidence = (
  confidence: number | undefined,
): confidence is number =>
  typeof confidence === "number" && confidence < LOW_CONFIDENCE_THRESHOLD;

/** A field the model read with low confidence. */
export interface LowConfidenceField {
  /** A StatName, or PLAYER_NAME_FIELD for the row's name. */
  field: string;
  confidence: number;
}

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
  /** The session player's name; not every player has a member profile. */
  name: string;
  // Stats captured and validated by vision processors, not DB shape
  stats: Stat[];
  /** Fields the model wasn't confident about; absent when it was sure of all of them. */
  lowConfidence?: LowConfidenceField[];
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
  /** The reader saw this team marked as the winner on screen. */
  winner?: boolean;
};

export type AnalyzedPlayersObj = {
  type: "array";
  valueArray: AnalyzedPlayer[];
};
