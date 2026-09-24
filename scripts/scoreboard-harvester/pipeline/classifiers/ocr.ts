import { spawn } from "child_process";
import type { ChildProcessWithoutNullStreams } from "child_process";
import type { FrameClassifier, FrameVerdict } from "../detect";

export interface KeywordRules {
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
}

export interface OcrClassifierOptions extends KeywordRules {
  /** Absolute path to the compiled vision-ocr Swift binary. */
  visionOcrPath: string;
  /** Number of persistent OCR workers to keep alive. */
  concurrency: number;
}

interface OcrDaemonResponse {
  ok?: unknown;
  text?: unknown;
  error?: unknown;
}

/**
 * Decides whether one frame's OCR lines look like the game's scoreboard.
 *
 * @param lines - OCR text lines for the frame.
 * @param rules - Keyword/sentinel rules from the game profile and CLI.
 * @returns The verdict, with matched keywords as evidence.
 */
export function matchKeywords(
  lines: string[],
  rules: KeywordRules,
): FrameVerdict {
  const upperLines = lines.map((line) => line.toUpperCase());
  const sentinel = rules.endScreenSentinel?.toUpperCase();
  const matched = rules.keywords.filter((keyword) =>
    upperLines.some((line) => line.includes(keyword.toUpperCase())),
  );

  const passesKeywordCount = matched.length >= rules.minKeywords;
  // Sentinel can be detected either via the keyword-match list OR by
  // scanning OCR lines directly. The latter handles game profiles that
  // declare an endScreenSentinel that is NOT also in `keywords` — without
  // the line-scan, those profiles would always fail when requireEndScreen
  // is on, even with a perfect OCR result.
  const passesSentinelRule =
    !rules.requireEndScreen ||
    sentinel === undefined ||
    matched.some((k) => k.toUpperCase() === sentinel) ||
    upperLines.some((line) => line.includes(sentinel));

  return {
    isScoreboard: passesKeywordCount && passesSentinelRule,
    evidence: [...matched],
  };
}

/**
 * macOS-only detector: Apple Vision OCR through persistent `vision-ocr
 * --daemon` workers (so Swift/Vision startup is paid once per worker, not
 * once per frame), confirmed by keyword count. One frame per batch; the
 * worker pool size matches the detection concurrency so every in-flight
 * frame has a worker.
 *
 * @param opts - Binary path, keyword rules, and worker count.
 * @returns A FrameClassifier for `detectFrames`.
 */
export function createOcrClassifier(
  opts: OcrClassifierOptions,
): FrameClassifier {
  const concurrency = Math.max(1, Math.floor(opts.concurrency));
  console.log(`[ocr] starting ${concurrency} persistent worker(s)`);
  const pool = new OcrWorkerPool(opts.visionOcrPath, concurrency);

  return {
    id: "ocr",
    batchSize: 1,
    classify: async ([frame]) => {
      const lines = await pool.recognize(frame.filePath);
      return [matchKeywords(lines, opts)];
    },
    close: () => pool.close(),
  };
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
