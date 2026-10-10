import path from "path";
import { specForGameId } from "@/lib/vision/scoreboard-specs";
import type { GameProfile } from "../games/types";
import type { FrameRecord, OcrRecord, ResolvedConfig } from "../types";
import type { DepCheckResult } from "./deps";
import { decideFrames, DECISIONS_INPUT_PER_M, DECISIONS_THRESHOLD } from "./decisions";
import { ocrFrames } from "./ocr";

export const FINDER_IDS = ["decisions", "rapidocr"] as const;
export type FinderId = (typeof FINDER_IDS)[number];

export interface FinderRun {
  /** Scoreboard frames, sorted by time. */
  confirmed: OcrRecord[];
  /** "decisions", "rapidocr", or "decisions+rapidocr" when it fell back partway. */
  finder: string;
  /** Why it fell back to RapidOCR, if it did. */
  fallback: string | null;
}

/**
 * Picks the scoreboard frames out of the sampled frames.
 *
 * `decisions` asks the Decisions API about every frame. Any frames it can't
 * answer (after retries), or everything left when it gives up (bad key,
 * exhausted quota, repeated failures), go to RapidOCR, so a Decisions outage
 * slows a run down instead of failing it.
 */
export async function findScoreboards(args: {
  finder: FinderId;
  frames: FrameRecord[];
  profile: GameProfile;
  config: ResolvedConfig;
  deps: DepCheckResult;
  workDir: string;
  skipAheadSec: number;
}): Promise<FinderRun> {
  const { finder, frames, profile, config, workDir } = args;
  if (finder === "rapidocr") return { confirmed: await rapidocr(args, frames), finder, fallback: null };

  const question = profile.azureGameId ? specForGameId(profile.azureGameId)?.finderQuestion : undefined;
  if (!question) return fallBack(args, frames, `no Decisions question for ${profile.id}`);
  if (!process.env.OPENAI_API_KEY) return fallBack(args, frames, "OPENAI_API_KEY is not set");

  const run = await decideFrames(frames, question, {
    logPath: path.join(workDir, "decisions.jsonl"),
    concurrency: config.decisionsConcurrency,
  });
  const inputTokens = run.verdicts.reduce((n, v) => n + (v.inputTokens ?? 0), 0);
  console.log(
    `[decisions] ${run.verdicts.length - run.unanswered.length}/${frames.length} frames answered, ` +
      `~$${((inputTokens * DECISIONS_INPUT_PER_M) / 1_000_000).toFixed(3)}`,
  );
  const positives: OcrRecord[] = run.verdicts
    .filter((v) => v.probability !== null && v.probability >= DECISIONS_THRESHOLD)
    .map((v) => ({
      ...frames.find((f) => f.frameId === v.frameId)!,
      text: [],
      matchedKeywords: [`decisions p=${v.probability!.toFixed(2)}`],
    }));
  if (run.unanswered.length === 0) return { confirmed: positives, finder, fallback: null };

  const reason =
    run.abortReason ?? `${run.unanswered.length} frame(s) had no answer after retries`;
  const rescued = await fallBack(args, run.unanswered, reason);
  return {
    confirmed: [...positives, ...rescued.confirmed].sort((a, b) => a.timestampSec - b.timestampSec),
    finder: "decisions+rapidocr",
    fallback: reason,
  };
}

async function fallBack(args: Parameters<typeof findScoreboards>[0], frames: FrameRecord[], reason: string): Promise<FinderRun> {
  console.warn(`[finder] falling back to RapidOCR for ${frames.length} frame(s): ${reason}`);
  return { confirmed: await rapidocr(args, frames), finder: "rapidocr", fallback: reason };
}

function rapidocr(args: Parameters<typeof findScoreboards>[0], frames: FrameRecord[]): Promise<OcrRecord[]> {
  const { deps, profile, config } = args;
  if (!deps.ocrEngine) throw new Error("No OCR engine available for RapidOCR");
  return ocrFrames(frames, {
    engine: deps.ocrEngine,
    keywords: profile.keywords,
    keywordNoise: profile.keywordNoise,
    minKeywords: config.ocrMinKeywords,
    endScreenSentinels: profile.endScreenSentinels,
    requireEndScreen: config.requireEndScreen,
    dedupGapSec: config.dedupGapSec,
    skipAheadSec: args.skipAheadSec,
    concurrency: config.ocrConcurrency,
  });
}
