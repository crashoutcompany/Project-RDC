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
  /** Width used when normalizing sampled frame JPEGs for pHash/OCR. */
  sampleWidth: number;
  /** ffmpeg JPEG quality for sampled frames. Lower is higher quality. */
  jpegQuality: number;
  /** Classifier calls in flight at once (OCR workers, or concurrent AI requests). */
  detectConcurrency: number;
  /** Which detector confirmed the frames. */
  detector: "ocr" | "ai";
  /** `<providerId>:<modelId>` spec for the AI detector. */
  detectModel?: string;
  /** AI detector: classify one frame every N frames (coarse pass). */
  aiStrideFrames: number;
  /** AI detector: tiles per side of each contact sheet. */
  aiGrid: number;
  /** AI detector: minimum confidence for a post-match verdict. */
  aiMinConfidence: number;
  /** AI detector: re-check every frame around each coarse hit. */
  aiRefine: boolean;
  /** Optional ffmpeg `-hwaccel` override ("none" for software decode). */
  hwaccel?: string;
  /** Run extraction on each saved match and write draft stats. */
  draft: boolean;
  /** `<providerId>:<modelId>` spec for draft extraction. */
  extractModel?: string;
  /** Session roster for draft extraction; empty means every known RDC member. */
  players: string[];
  /** When set, also write vision-eval fixtures (image + draft expected.json) here. */
  emitFixtures?: string;
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

/** A frame the active detector confirmed as an end-of-match scoreboard. */
export interface DetectionRecord extends FrameRecord {
  /**
   * Why it was confirmed: matched keywords for OCR, `<kind>@<confidence>`
   * for the AI detector.
   */
  evidence: string[];
  confidence?: number;
}

export interface MatchManifest {
  match: number;
  timestampSec: number;
  timestampStr: string;
  runLengthFrames: number;
  imagePath: string;
  /** Matched OCR keywords; empty for AI-detected matches. */
  ocrKeywords: string[];
  detection: {
    detector: "ocr" | "ai";
    model?: string;
    evidence: string[];
    confidence?: number;
  };
  /** Present when --draft ran extraction on this match. */
  draft?: MatchDraft;
  submission: unknown | null;
}

export interface MatchDraft {
  model: string;
  /** VisionResultCodes value: Success, CheckRequest, or Failed. */
  status: string;
  message?: string;
  /** Path of the match-NN.json draft, relative to the run directory. */
  draftPath: string;
  players?: { name: string; stats: { stat: string; statValue: string }[] }[];
  winners?: string[];
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
