import { runCapture } from "../utils";
import { FrameRecord, OcrRecord } from "../types";

export interface OcrOptions {
  /** Absolute path to the compiled vision-ocr Swift binary. */
  visionOcrPath: string;
  /** Game keywords to match against OCR output (case-insensitive substring). */
  keywords: readonly string[];
  /** Minimum keyword hits required to mark a frame as a confirmed scoreboard. */
  minKeywords: number;
  /**
   * When set with `requireEndScreen=true`, frames missing this keyword are
   * rejected. Tightens precision at the cost of dropping legit scoreboards
   * where Vision misreads the sentinel.
   */
  endScreenSentinel?: string;
  requireEndScreen: boolean;
  /**
   * Max frame-id gap inside one "run" of confirmed frames. Used for two
   * things: (1) the skip-ahead trigger looks for a gap of this size after
   * the last confirmed frame to know a run has ended; (2) downstream dedup
   * uses the same value to cluster confirmed records into matches.
   */
  dedupGap: number;
  /**
   * After a confirmed run ends, jump this many frame IDs forward before
   * resuming OCR. 0 disables skip-ahead (the loop OCRs every frame).
   *
   * NOTE: this is in *frame ID space*, not array-index space — so it works
   * correctly whether OCR is seeing the full frame sequence (--no-phash) or
   * a sparse pHash-survivor subset.
   */
  skipAheadFrames: number;
}

/**
 * Runs OCR over the given frames in sequence, returning the ones that meet
 * the keyword threshold (and the end-screen sentinel rule, if enabled).
 *
 * Sequential because vision-ocr is single-threaded per invocation and macOS
 * Vision already uses all cores internally on .accurate mode; parallel
 * spawns deliver minimal speedup and complicate progress logging.
 *
 * SKIP-AHEAD: once a run of confirmed frames ends — defined as seeing an
 * unconfirmed frame whose frameId is more than `dedupGap` past the last
 * confirmed frameId — the loop fast-forwards by `skipAheadFrames` frame IDs
 * before resuming. This relies on real games having a minimum interval
 * between consecutive end-of-match scoreboards (e.g., RL ≥ 3 min = ≥ 180
 * frames at 1 fps). See games/<id>.ts for per-game settings.
 *
 * @param frames - Candidate frames in ascending frameId order. Either the full
 *   sample sequence (--no-phash) or pHash survivors.
 * @param opts - OCR + game options. See OcrOptions JSDoc above.
 * @returns OCR records for confirmed frames only, in original order.
 */
export async function ocrFrames(
  frames: FrameRecord[],
  opts: OcrOptions,
): Promise<OcrRecord[]> {
  const out: OcrRecord[] = [];
  const sentinel = opts.endScreenSentinel?.toUpperCase();

  // State for skip-ahead.
  let lastConfirmedFrameId = -1;
  let inRun = false;
  let skipToFrameId = -1;
  let skippedTotal = 0;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];

    if (opts.skipAheadFrames > 0 && f.frameId < skipToFrameId) {
      skippedTotal++;
      continue;
    }

    let lines: string[];
    try {
      lines = await runOcr(opts.visionOcrPath, f.filePath);
    } catch (err) {
      console.warn(
        `[ocr] frame ${f.frameId} failed: ${err instanceof Error ? err.message : err}`,
      );
      continue;
    }

    const upperLines = lines.map((l) => l.toUpperCase());
    const matched = opts.keywords.filter((k) =>
      upperLines.some((line) => line.includes(k.toUpperCase())),
    );

    const passesKeywordCount = matched.length >= opts.minKeywords;
    // Sentinel can be detected either via the keyword-match list OR by
    // scanning OCR lines directly. The latter handles game profiles that
    // declare an endScreenSentinel that is NOT also in `keywords` — without
    // the line-scan, those profiles would always fail when requireEndScreen
    // is on, even with a perfect OCR result.
    const passesSentinelRule =
      !opts.requireEndScreen ||
      sentinel === undefined ||
      matched.some((k) => k.toUpperCase() === sentinel) ||
      upperLines.some((line) => line.includes(sentinel));

    if (passesKeywordCount && passesSentinelRule) {
      out.push({
        ...f,
        text: lines,
        matchedKeywords: [...matched],
      });
      lastConfirmedFrameId = f.frameId;
      inRun = true;
    } else if (
      inRun &&
      f.frameId - lastConfirmedFrameId > opts.dedupGap
    ) {
      // We just confirmed we've exited a run. Schedule a skip-ahead.
      if (opts.skipAheadFrames > 0) {
        skipToFrameId = lastConfirmedFrameId + opts.skipAheadFrames;
        console.log(
          `[ocr] skip-ahead: run ended at frame ${lastConfirmedFrameId}, ` +
            `jumping past frame ${skipToFrameId - 1}`,
        );
      }
      inRun = false;
    }

    if ((i + 1) % 50 === 0 || i === frames.length - 1) {
      console.log(
        `[ocr] ${i + 1}/${frames.length} confirmed=${out.length}` +
          (skippedTotal > 0 ? ` skipped=${skippedTotal}` : ""),
      );
    }
  }

  if (skippedTotal > 0) {
    console.log(
      `[ocr] skip-ahead saved ${skippedTotal} OCR calls ` +
        `(~${Math.round((skippedTotal / frames.length) * 100)}% of frames)`,
    );
  }

  return out;
}

/**
 * Spawns vision-ocr for a single image and parses its JSON output.
 *
 * @param binPath - Resolved path to the vision-ocr binary.
 * @param imagePath - Image file to OCR.
 * @returns Array of recognized text lines.
 */
async function runOcr(binPath: string, imagePath: string): Promise<string[]> {
  const stdout = await runCapture(binPath, [imagePath]);
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((x): x is string => typeof x === "string");
}
