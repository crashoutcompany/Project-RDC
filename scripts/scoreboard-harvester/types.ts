import type { AnalysisResults } from "@/lib/visionTypes";
import type { ReaderId } from "@/lib/vision/readers";
import type { FinderId } from "./pipeline/finders";

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
   * If true, only accept frames whose OCR includes one of the active game's
   * endScreenSentinels (e.g., "WINNER" for Rocket League).
   */
  requireEndScreen: boolean;
  /** Max timestamp gap (seconds) allowed within a single dedup run. */
  dedupGapSec: number;
  /**
   * After a confirmed run ends, skip ahead this many seconds before resuming
   * OCR. Set to 0 to disable skip-ahead (every frame is OCR'd).
   */
  skipAheadSec: number;
  /** `fps` samples at a fixed rate; `keyframes` decodes I-frames only. */
  sampling: "fps" | "keyframes";
  /** OCR backend; `auto` = Apple Vision on macOS, RapidOCR elsewhere. */
  ocrEngine: "auto" | "vision" | "rapidocr";
  quality: number;
  /** Width used when normalizing sampled frame JPEGs for pHash/OCR. */
  sampleWidth: number;
  /** ffmpeg JPEG quality for sampled frames. Lower is higher quality. */
  jpegQuality: number;
  /** Number of persistent OCR workers to run concurrently. */
  ocrConcurrency: number;
  keepFrames: boolean;
  /** Keep the downloaded video.mp4 after a successful run. */
  keepVideo: boolean;
  start?: number;
  end?: number;
  /** Read every saved scoreboard's stats. */
  analyze: boolean;
  /** Finds scoreboard frames; `decisions` falls back to RapidOCR on errors. */
  finder: FinderId;
  /** Reads stats; `gemini` falls back to Azure on errors. */
  reader: ReaderId;
  /**
   * Bulk mode: Gemini reads through its Batch API (half price, slower), and
   * Decisions runs at higher concurrency (it has no batch API).
   */
  batch: boolean;
  /** Decisions calls in flight at once. */
  decisionsConcurrency: number;
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
  /** Reader + game-processor result for this screenshot, when analyzed. */
  analysis: AnalysisResults | null;
  /** Which reader produced `analysis`, and any that failed before it. */
  reader?: { id: string; fallbacks: string[] };
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
  /** Finder that actually ran, and why it fell back, if it did. */
  finder?: { id: string; fallback: string | null };
  runtimeMs: number;
  matches: MatchManifest[];
}
