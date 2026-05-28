/**
 * Shared types for the scoreboard harvester pipeline. Game-specific knowledge
 * lives in games/ — these types are intentionally game-agnostic.
 */

export interface ResolvedConfig {
  /** Slug from --game. Validated against the registry. */
  gameId: string;
  /** Output root. Final per-run dir is `<out>/<gameId>/<videoId>/`. */
  out: string;
  fps: number;
  noPhash: boolean;
  phashThreshold: number;
  ocrMinKeywords: number;
  /**
   * If true, only accept frames whose OCR includes the active game's
   * endScreenSentinel keyword (e.g., "WINNER" for Rocket League).
   */
  requireEndScreen: boolean;
  /** Max frame gap allowed within a single dedup run. */
  dedupGap: number;
  /**
   * After a confirmed run ends, jump this many frames forward before resuming
   * OCR. Set to 0 to disable skip-ahead (every frame is OCR'd).
   */
  skipAheadFrames: number;
  quality: number;
  keepFrames: boolean;
  start?: number;
  end?: number;
  submit: boolean;
  sessionId?: number;
  referencePath: string;
}

export interface FrameRecord {
  /** 1-based frame index in the sampled sequence */
  frameId: number;
  filePath: string;
  /** Timestamp in seconds from the start of the source video */
  timestampSec: number;
}

export interface PHashRecord extends FrameRecord {
  hashHex: string;
  /** Hamming distance from the reference scoreboard hash (0–64) */
  distance: number;
}

export interface OcrRecord extends FrameRecord {
  /** Raw recognized text lines, top-to-bottom */
  text: string[];
  /** Subset of the active game's keywords that matched on this frame */
  matchedKeywords: string[];
}

export interface MatchManifest {
  match: number;
  timestampSec: number;
  timestampStr: string;
  runLengthFrames: number;
  imagePath: string;
  ocrKeywords: string[];
  submission: unknown | null;
}

export interface Manifest {
  /** Slug of the game profile used for this run. */
  game: string;
  source: {
    url?: string;
    filePath: string;
    durationSec: number;
    fps: number;
  };
  config: Record<string, unknown>;
  runtimeMs: number;
  matches: MatchManifest[];
}
