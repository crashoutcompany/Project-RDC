import { spawn } from "child_process";
import type { ChildProcessWithoutNullStreams } from "child_process";
import type { FrameRecord, OcrRecord } from "../types";

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
  /**
   * Number of persistent OCR workers to keep alive. Results are still applied
   * in frame order so skip-ahead behavior matches the sequential state machine.
   */
  concurrency: number;
}

interface OcrAttempt {
  frame: FrameRecord;
  lines?: string[];
  error?: unknown;
}

interface OcrDaemonResponse {
  ok?: unknown;
  text?: unknown;
  error?: unknown;
}

/**
 * Runs OCR over the given frames, returning the ones that meet the keyword
 * threshold (and the end-screen sentinel rule, if enabled).
 *
 * OCR is executed through one or more persistent vision-ocr daemon workers so
 * the Swift/Vision process startup cost is paid once per worker, not once per
 * frame. Results are applied in ascending frame order to preserve the original
 * skip-ahead state machine.
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
  const keywords = opts.keywords.map((keyword) => ({
    raw: keyword,
    upper: keyword.toUpperCase(),
  }));
  const concurrency = Number.isFinite(opts.concurrency)
    ? Math.max(1, Math.floor(opts.concurrency))
    : 1;

  // State for skip-ahead.
  let lastConfirmedFrameId = -1;
  let inRun = false;
  let skipToFrameId = -1;
  let skippedTotal = 0;
  let ignoredInFlight = 0;

  if (frames.length === 0) return out;

  console.log(`[ocr] starting ${concurrency} persistent worker(s)`);
  const workerPool = new OcrWorkerPool(opts.visionOcrPath, concurrency);
  const inflight = new Map<number, Promise<OcrAttempt>>();
  const skippedIndices = new Set<number>();
  let nextToSchedule = 0;
  let nextToProcess = 0;

  /**
   * Keeps the worker pool full while honoring any skip-ahead boundary that is
   * already known at schedule time.
   */
  function scheduleUntilFull(): void {
    while (inflight.size < concurrency && nextToSchedule < frames.length) {
      const index = nextToSchedule;
      const frame = frames[index];
      nextToSchedule++;

      if (opts.skipAheadFrames > 0 && frame.frameId < skipToFrameId) {
        skippedTotal++;
        skippedIndices.add(index);
        continue;
      }

      inflight.set(
        index,
        workerPool
          .recognize(frame.filePath)
          .then((lines) => ({ frame, lines }))
          .catch((error) => ({ frame, error })),
      );
    }
  }

  /**
   * Logs progress at the same cadence as the old sequential loop.
   *
   * @param index - Zero-based frame index that was just resolved.
   */
  function logProgress(index: number): void {
    if ((index + 1) % 50 === 0 || index === frames.length - 1) {
      console.log(
        `[ocr] ${index + 1}/${frames.length} confirmed=${out.length}` +
          (skippedTotal > 0 ? ` skipped=${skippedTotal}` : "") +
          (ignoredInFlight > 0 ? ` ignored=${ignoredInFlight}` : ""),
      );
    }
  }

  try {
    while (nextToProcess < frames.length) {
      scheduleUntilFull();

      if (skippedIndices.delete(nextToProcess)) {
        logProgress(nextToProcess);
        nextToProcess++;
        continue;
      }

      const pending = inflight.get(nextToProcess);
      if (!pending) {
        // This should only be reachable for an empty tail after schedule-time
        // skips. Advance defensively rather than spinning forever.
        logProgress(nextToProcess);
        nextToProcess++;
        continue;
      }

      const attempt = await pending;
      inflight.delete(nextToProcess);

      if (opts.skipAheadFrames > 0 && attempt.frame.frameId < skipToFrameId) {
        ignoredInFlight++;
        logProgress(nextToProcess);
        nextToProcess++;
        continue;
      }

      if (attempt.error) {
        console.warn(
          `[ocr] frame ${attempt.frame.frameId} failed: ${
            attempt.error instanceof Error
              ? attempt.error.message
              : attempt.error
          }`,
        );
        logProgress(nextToProcess);
        nextToProcess++;
        continue;
      }

      const lines = attempt.lines ?? [];
      const upperLines = lines.map((line) => line.toUpperCase());
      const matched = keywords
        .filter((keyword) =>
          upperLines.some((line) => line.includes(keyword.upper)),
        )
        .map((keyword) => keyword.raw);

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
          ...attempt.frame,
          text: lines,
          matchedKeywords: [...matched],
        });
        lastConfirmedFrameId = attempt.frame.frameId;
        inRun = true;
      } else if (
        inRun &&
        attempt.frame.frameId - lastConfirmedFrameId > opts.dedupGap
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

      logProgress(nextToProcess);
      nextToProcess++;
    }
  } finally {
    await workerPool.close();
  }

  if (skippedTotal > 0)
    console.log(
      `[ocr] skip-ahead saved ${skippedTotal} OCR calls ` +
        `(~${Math.round((skippedTotal / frames.length) * 100)}% of frames)`,
    );
  if (ignoredInFlight > 0)
    console.log(
      `[ocr] ignored ${ignoredInFlight} already-in-flight OCR result(s) after skip-ahead`,
    );

  return out;
}

/**
 * Manages a pool of persistent vision-ocr daemon processes.
 */
class OcrWorkerPool {
  private readonly workers: OcrDaemonWorker[];
  private nextWorker = 0;

  /**
   * Creates a pool of daemon workers.
   *
   * @param binPath - Resolved path to the vision-ocr binary.
   * @param concurrency - Number of workers to spawn.
   */
  constructor(binPath: string, concurrency: number) {
    this.workers = Array.from(
      { length: concurrency },
      (_, index) => new OcrDaemonWorker(binPath, index + 1),
    );
  }

  /**
   * Sends one image to the next daemon in round-robin order.
   *
   * @param imagePath - Image path to OCR.
   * @returns Recognized text lines.
   */
  recognize(imagePath: string): Promise<string[]> {
    const worker = this.workers[this.nextWorker];
    this.nextWorker = (this.nextWorker + 1) % this.workers.length;
    return worker.recognize(imagePath);
  }

  /**
   * Gracefully shuts down every daemon.
   */
  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }
}

/**
 * Wraps one long-lived vision-ocr --daemon process.
 *
 * @param binPath - Resolved path to the vision-ocr binary.
 */
class OcrDaemonWorker {
  private readonly proc: ChildProcessWithoutNullStreams;
  private readonly pending: Array<{
    imagePath: string;
    resolve: (lines: string[]) => void;
    reject: (err: Error) => void;
  }> = [];
  private stdoutBuffer = "";
  private stderr = "";
  private closing = false;

  /**
   * Starts one daemon process.
   *
   * @param binPath - Resolved path to the vision-ocr binary.
   * @param id - Worker ID used in diagnostics.
   */
  constructor(
    binPath: string,
    private readonly id: number,
  ) {
    this.proc = spawn(binPath, ["--daemon"]);
    this.proc.stdout.on("data", (data) => this.handleStdout(data));
    this.proc.stderr.on("data", (data) => {
      this.stderr = (this.stderr + String(data)).slice(-4000);
    });
    this.proc.on("error", (err) => this.rejectPending(err));
    this.proc.on("close", (code) => {
      if (this.pending.length === 0) return;
      const suffix = this.stderr.trim() ? `: ${this.stderr.trim()}` : "";
      this.rejectPending(
        new Error(
          `vision-ocr worker ${this.id} exited with code ${code}${suffix}`,
        ),
      );
    });
  }

  /**
   * Sends one image path to the daemon.
   *
   * @param imagePath - Image path to OCR.
   * @returns Recognized text lines.
   */
  recognize(imagePath: string): Promise<string[]> {
    if (this.proc.exitCode !== null)
      return Promise.reject(
        new Error(`vision-ocr worker ${this.id} is not running`),
      );

    return new Promise((resolve, reject) => {
      const request = {
        imagePath,
        resolve,
        reject,
      };
      this.pending.push(request);
      this.proc.stdin.write(`${imagePath}\n`, (err) => {
        if (!err) return;
        const index = this.pending.indexOf(request);
        if (index >= 0) this.pending.splice(index, 1);
        reject(err);
      });
    });
  }

  /**
   * Gracefully exits the daemon after all queued requests complete.
   */
  close(): Promise<void> {
    this.closing = true;
    if (this.proc.exitCode !== null) return Promise.resolve();

    return new Promise((resolve) => {
      this.proc.once("close", () => resolve());
      this.proc.stdin.end();
    });
  }

  /**
   * Parses newline-delimited daemon responses.
   *
   * @param data - stdout chunk from the daemon.
   */
  private handleStdout(data: Buffer): void {
    this.stdoutBuffer += String(data);
    let newline = this.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline);
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      this.handleLine(line);
      newline = this.stdoutBuffer.indexOf("\n");
    }
  }

  /**
   * Resolves or rejects the oldest pending OCR request.
   *
   * @param line - One JSON response line from the daemon.
   */
  private handleLine(line: string): void {
    if (line.trim() === "") return;
    const request = this.pending.shift();
    if (!request) {
      console.warn(
        `[ocr] worker ${this.id} emitted an unexpected line: ${line}`,
      );
      return;
    }

    let parsed: OcrDaemonResponse;
    try {
      parsed = JSON.parse(line) as OcrDaemonResponse;
    } catch (err) {
      request.reject(
        new Error(
          `vision-ocr worker ${this.id} emitted invalid JSON for ${request.imagePath}: ${
            err instanceof Error ? err.message : err
          }`,
        ),
      );
      return;
    }

    if (parsed.ok === true) {
      const lines = Array.isArray(parsed.text)
        ? parsed.text.filter((x): x is string => typeof x === "string")
        : [];
      request.resolve(lines);
      return;
    }

    request.reject(
      new Error(
        typeof parsed.error === "string"
          ? parsed.error
          : `vision-ocr worker ${this.id} failed on ${request.imagePath}`,
      ),
    );
  }

  /**
   * Rejects all queued requests after a process-level failure.
   *
   * @param err - Failure to propagate.
   */
  private rejectPending(err: Error): void {
    if (this.closing && this.pending.length === 0) return;
    while (this.pending.length > 0) {
      this.pending.shift()?.reject(err);
    }
  }
}
