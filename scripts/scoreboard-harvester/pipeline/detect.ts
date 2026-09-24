import type { DetectionRecord, FrameRecord } from "../types";

/** One classifier decision for one frame. */
export interface FrameVerdict {
  isScoreboard: boolean;
  confidence?: number;
  /** Human-readable reasons, recorded in the manifest (keywords, `<kind>@<conf>`). */
  evidence: string[];
}

/**
 * Anything that can decide whether frames show an end-of-match scoreboard.
 * `classify` receives up to `batchSize` frames in ascending frameId order and
 * must return exactly one verdict per frame, in the same order.
 */
export interface FrameClassifier {
  /** "ocr" or "ai" — recorded in the manifest. */
  id: "ocr" | "ai";
  /** Model spec for AI classifiers, recorded in the manifest. */
  model?: string;
  batchSize: number;
  classify(frames: FrameRecord[]): Promise<FrameVerdict[]>;
  close(): Promise<void>;
}

export interface DetectOptions {
  /**
   * Max frame-id gap inside one "run" of confirmed frames. The skip-ahead
   * trigger looks for an unconfirmed frame more than this far past the last
   * confirmed one to know a run has ended; dedup reuses the same value to
   * cluster confirmed records into matches.
   */
  dedupGap: number;
  /**
   * After a confirmed run ends, jump this many frame IDs forward before
   * resuming. 0 disables skip-ahead.
   *
   * This is in *frame ID space*, not array-index space — so it works the
   * same whether the input is every sampled frame, pHash survivors, or the
   * AI detector's coarse stride.
   */
  skipAheadFrames: number;
  /** Classifier batches in flight at once. */
  concurrency: number;
  /** Log prefix, e.g. "ocr" or "ai". */
  label: string;
}

type BatchResult =
  | { frames: FrameRecord[]; verdicts: FrameVerdict[] }
  | { frames: FrameRecord[]; error: unknown };

/**
 * Runs a classifier over candidate frames and returns the confirmed ones.
 *
 * Batches are scheduled ahead (up to `concurrency` in flight) but their
 * results are applied strictly in frame order, so the skip-ahead state
 * machine behaves exactly as if frames were classified one at a time:
 *
 * once a run of confirmed frames ends — an unconfirmed frame more than
 * `dedupGap` past the last confirmed frameId — frames below
 * `lastConfirmed + skipAheadFrames` are skipped. Frames already in flight
 * (or later in the same batch) that fall under the new boundary are ignored.
 * This relies on real games having a minimum interval between consecutive
 * end-of-match scoreboards (see games/<id>.ts).
 *
 * @param frames - Candidate frames in ascending frameId order.
 * @param classifier - Detector to run. The caller owns `close()`, so one
 *   classifier can serve several passes (the AI detector's coarse + refine).
 * @param opts - Run/skip-ahead tuning.
 * @returns Confirmed frames, in original order.
 */
export async function detectFrames(
  frames: FrameRecord[],
  classifier: FrameClassifier,
  opts: DetectOptions,
): Promise<DetectionRecord[]> {
  const out: DetectionRecord[] = [];
  const concurrency = Number.isFinite(opts.concurrency)
    ? Math.max(1, Math.floor(opts.concurrency))
    : 1;
  const batchSize = Math.max(1, Math.floor(classifier.batchSize));
  const { label } = opts;

  let lastConfirmedFrameId = -1;
  let inRun = false;
  let skipToFrameId = -1;
  let skippedTotal = 0;
  let ignoredInFlight = 0;
  let failedTotal = 0;
  let handled = 0;
  let nextLogAt = 50;

  if (frames.length === 0) return out;

  const isSkipped = (frame: FrameRecord) =>
    opts.skipAheadFrames > 0 && frame.frameId < skipToFrameId;

  let cursor = 0;
  const queue: Promise<BatchResult>[] = [];

  /** Pulls the next batch of not-yet-skipped frames. */
  function nextBatch(): FrameRecord[] | undefined {
    const batch: FrameRecord[] = [];
    while (cursor < frames.length && batch.length < batchSize) {
      const frame = frames[cursor++];
      if (isSkipped(frame)) {
        skippedTotal++;
        handled++;
        continue;
      }
      batch.push(frame);
    }
    return batch.length > 0 ? batch : undefined;
  }

  function fillQueue(): void {
    while (queue.length < concurrency) {
      const batch = nextBatch();
      if (!batch) return;
      queue.push(
        classifier.classify(batch).then(
          (verdicts) => ({ frames: batch, verdicts }),
          (error) => ({ frames: batch, error }),
        ),
      );
    }
  }

  function logProgress(): void {
    if (handled < nextLogAt && handled < frames.length) return;
    nextLogAt = (Math.floor(handled / 50) + 1) * 50;
    console.log(
      `[${label}] ${handled}/${frames.length} confirmed=${out.length}` +
        (skippedTotal > 0 ? ` skipped=${skippedTotal}` : "") +
        (ignoredInFlight > 0 ? ` ignored=${ignoredInFlight}` : "") +
        (failedTotal > 0 ? ` failed=${failedTotal}` : ""),
    );
  }

  fillQueue();
  while (queue.length > 0) {
    const result = await queue.shift()!;

    if ("error" in result) {
      failedTotal += result.frames.length;
      const { error } = result;
      console.warn(
        `[${label}] frames ${result.frames[0].frameId}-${result.frames.at(-1)!.frameId} failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }

    result.frames.forEach((frame, i) => {
      handled++;
      if ("error" in result) return;

      if (isSkipped(frame)) {
        ignoredInFlight++;
        return;
      }

      const verdict = result.verdicts[i];
      if (!verdict) {
        failedTotal++;
        return;
      }

      if (verdict.isScoreboard) {
        out.push({
          ...frame,
          evidence: verdict.evidence,
          confidence: verdict.confidence,
        });
        lastConfirmedFrameId = frame.frameId;
        inRun = true;
      } else if (inRun && frame.frameId - lastConfirmedFrameId > opts.dedupGap) {
        // We just confirmed we've exited a run. Schedule a skip-ahead.
        if (opts.skipAheadFrames > 0) {
          skipToFrameId = lastConfirmedFrameId + opts.skipAheadFrames;
          console.log(
            `[${label}] skip-ahead: run ended at frame ${lastConfirmedFrameId}, ` +
              `jumping past frame ${skipToFrameId - 1}`,
          );
        }
        inRun = false;
      }
    });

    logProgress();
    fillQueue();
  }

  if (skippedTotal > 0)
    console.log(
      `[${label}] skip-ahead saved ${skippedTotal} classifications ` +
        `(~${Math.round((skippedTotal / frames.length) * 100)}% of frames)`,
    );
  if (ignoredInFlight > 0)
    console.log(
      `[${label}] ignored ${ignoredInFlight} already-in-flight result(s) after skip-ahead`,
    );
  if (failedTotal > 0)
    console.warn(`[${label}] ${failedTotal} frame(s) could not be classified`);

  return out;
}

/**
 * Picks the frames the AI detector's refine pass should classify: every
 * sampled frame in the window around each coarse run that the coarse stride
 * skipped. Coarse hits a `stride` apart bound the true run to within
 * `stride - 1` frames on each side.
 *
 * @param allFrames - Every sampled frame, ascending frameId.
 * @param runs - Coarse confirmed runs (see `clusterConsecutive`).
 * @param strideFrames - Coarse sampling stride, in frames.
 * @param alreadyClassified - frameIds the coarse pass already saw.
 * @returns Frames to refine, ascending frameId.
 */
export function selectRefineFrames(
  allFrames: FrameRecord[],
  runs: FrameRecord[][],
  strideFrames: number,
  alreadyClassified: ReadonlySet<number>,
): FrameRecord[] {
  if (strideFrames <= 1 || runs.length === 0) return [];
  const windows = runs.map((run) => ({
    lo: run[0].frameId - strideFrames + 1,
    hi: run.at(-1)!.frameId + strideFrames - 1,
  }));
  return allFrames.filter(
    (frame) =>
      !alreadyClassified.has(frame.frameId) &&
      windows.some((w) => frame.frameId >= w.lo && frame.frameId <= w.hi),
  );
}
