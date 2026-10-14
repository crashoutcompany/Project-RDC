import fs from "fs";
import OpenAI from "openai";
import { classificationOf, withRetry } from "@/lib/vision/api-errors";
import type { FrameRecord } from "../types";

export const DECISIONS_MODEL = "gpt-6-luna";
/** Input tokens only; Decisions doesn't bill output. */
export const DECISIONS_INPUT_PER_M = 0.1;

/** Probability at which a frame counts as a scoreboard (13/13, 0 false positives in the benchmark). */
export const DECISIONS_THRESHOLD = 0.5;
/** Consecutive frames that fail even after retries before the finder gives up on Decisions. */
const MAX_CONSECUTIVE_FAILURES = 3;

export interface FrameVerdict {
  frameId: number;
  startedAt: string;
  timestampSec: number;
  probability: number | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
}

export interface DecisionsRun {
  verdicts: FrameVerdict[];
  /** Frames with no usable answer (failed, refused, or never asked after giving up). */
  unanswered: FrameRecord[];
  /** Why Decisions stopped early, if it did. */
  abortReason: string | null;
}

/**
 * Asks Decisions "is this frame the scoreboard?" for every frame, `concurrency`
 * at a time. Rate limits and server errors are retried with backoff. A fatal
 * error (bad key, exhausted quota) or a run of consecutive failures stops the
 * run; the frames left unanswered are returned so the caller can hand them to
 * another finder.
 *
 * Verdicts append to `logPath`, so an interrupted run resumes and only frames
 * without an answer are asked again.
 */
export async function decideFrames(
  frames: FrameRecord[],
  question: string,
  opts: { logPath: string; concurrency: number; client?: OpenAI },
): Promise<DecisionsRun> {
  const done = new Map<number, FrameVerdict>();
  if (fs.existsSync(opts.logPath))
    for (const line of fs.readFileSync(opts.logPath, "utf8").split("\n").filter(Boolean)) {
      const v = JSON.parse(line) as FrameVerdict;
      done.set(v.frameId, v);
    }
  const todo = frames.filter((f) => !answered(done.get(f.frameId)));
  const client = opts.client ?? new OpenAI({ maxRetries: 0 });
  const log = fs.openSync(opts.logPath, "a");
  let next = 0;
  let finished = 0;
  let consecutiveFailures = 0;
  let abortReason: string | null = null;

  const worker = async () => {
    while (next < todo.length && !abortReason) {
      const frame = todo[next++];
      const image = fs.readFileSync(frame.filePath).toString("base64");
      const startedAt = new Date().toISOString();
      const t0 = performance.now();
      let verdict: FrameVerdict;
      try {
        const decision = await withRetry(() =>
          client.decisions.create({
            model: DECISIONS_MODEL,
            input: [
              {
                role: "user",
                content: [{ type: "input_image", image_url: `data:image/jpeg;base64,${image}` }],
              },
            ],
            questions: [{ type: "predicate", name: "is_scoreboard", instructions: question }],
          }),
        );
        const answer = decision.answers[0];
        verdict = {
          frameId: frame.frameId,
          startedAt,
          timestampSec: frame.timestampSec,
          probability: answer?.type === "predicate" ? answer.probability : null,
          latencyMs: Math.round(performance.now() - t0),
          inputTokens: decision.usage.input_tokens,
          outputTokens: decision.usage.output_tokens,
          error: answer?.type === "predicate" ? null : "refusal",
        };
        consecutiveFailures = 0;
      } catch (err) {
        const classified = classificationOf(err);
        verdict = {
          frameId: frame.frameId,
          startedAt,
          timestampSec: frame.timestampSec,
          probability: null,
          latencyMs: Math.round(performance.now() - t0),
          inputTokens: null,
          outputTokens: null,
          error: classified.reason,
        };
        if (classified.kind === "fatal") abortReason = classified.reason;
        else if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
          abortReason = `${consecutiveFailures} frames in a row failed (last: ${classified.reason})`;
      }
      done.set(frame.frameId, verdict);
      fs.writeSync(log, JSON.stringify(verdict) + "\n");
      if (++finished % 100 === 0 || finished === todo.length)
        console.log(`[decisions] ${finished}/${todo.length}`);
    }
  };

  try {
    await Promise.all(Array.from({ length: opts.concurrency }, worker));
  } finally {
    fs.closeSync(log);
  }
  return {
    verdicts: frames.flatMap((f) => (done.has(f.frameId) ? [done.get(f.frameId)!] : [])),
    unanswered: frames.filter((f) => !answered(done.get(f.frameId))),
    abortReason,
  };
}

function answered(v: FrameVerdict | undefined): boolean {
  return v !== undefined && v.error === null && v.probability !== null;
}
