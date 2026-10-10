import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { checkDeps } from "../scoreboard-harvester/pipeline/deps";
import { downloadVideo } from "../scoreboard-harvester/pipeline/download";
import { ocrFrames } from "../scoreboard-harvester/pipeline/ocr";
import { sampleFrames } from "../scoreboard-harvester/pipeline/sample";
import { GAME_PROFILES } from "../scoreboard-harvester/games/registry";
import type { FrameRecord } from "../scoreboard-harvester/types";
import { DECISIONS, PRICES_CHECKED, WEEKLY_VIDEOS } from "./config";
import { resolveGame } from "./games";
import type { Dataset } from "./types";

const HARVESTER_ROOT = path.resolve(import.meta.dirname, "../scoreboard-harvester");
/** A detection within this many seconds of a known scoreboard counts as finding it. */
const MATCH_WINDOW_SEC = 30;
/** Positive frames closer than this belong to the same detection. */
const RUN_GAP_SEC = 20;
const THRESHOLDS = [0.3, 0.5, 0.7, 0.9];

interface FrameVerdict {
  frameId: number;
  startedAt: string;
  timestampSec: number;
  probability: number | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
}

interface FinderResult {
  method: string;
  threshold: number | null;
  found: number;
  known: number;
  falsePositives: number;
  falsePositiveTimes: number[];
  missedTimes: number[];
  totalTimeMs: number;
  frames: number;
  inputTokens: number | null;
  costUsd: number | null;
}

/** Groups positive timestamps into detections and matches them to known scoreboards. */
export function scoreDetections(positives: number[], known: number[]) {
  const runs: number[][] = [];
  for (const t of [...positives].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && t - last.at(-1)! <= RUN_GAP_SEC) last.push(t);
    else runs.push([t]);
  }
  const hit = new Set<number>();
  const falsePositiveTimes: number[] = [];
  for (const run of runs) {
    const target = known.find(
      (k) => !hit.has(k) && run.some((t) => Math.abs(t - k) <= MATCH_WINDOW_SEC),
    );
    if (target === undefined) falsePositiveTimes.push(run[0]);
    else hit.add(target);
  }
  return {
    found: hit.size,
    falsePositiveTimes,
    missedTimes: known.filter((k) => !hit.has(k)),
  };
}

/**
 * Scoreboard-finding experiment: Decisions (one predicate per keyframe) vs
 * RapidOCR (the harvester's keyword gate) on the same keyframes, scored
 * against the scoreboards in the dataset.
 */
export async function runFinder(args: {
  dataset: Dataset;
  video: string;
  methods: ("decisions" | "rapidocr")[];
  outDir: string;
}): Promise<FinderResult[]> {
  const { dataset, outDir } = args;
  const spec = resolveGame(dataset.game);
  const known = dataset.cases.flatMap((c) => (c.timestampSec === undefined ? [] : [c.timestampSec]));
  if (known.length === 0) throw new Error("Dataset cases have no timestamps to score against");
  fs.mkdirSync(outDir, { recursive: true });

  const isUrl = /^https?:\/\//.test(args.video);
  const deps = checkDeps(HARVESTER_ROOT, isUrl);
  if (!deps.ffmpegPath || !deps.ffprobePath) throw new Error(deps.errors.join("\n"));
  const videoPath = isUrl
    ? (
        await downloadVideo({
          ytDlpPath: deps.ytDlpPath,
          ytDlpArgs: deps.ytDlpArgs,
          ffprobePath: deps.ffprobePath,
          url: args.video,
          outDir,
          maxHeight: 720,
        })
      ).filePath
    : path.resolve(args.video);

  const frames = await sampleFrames({
    ffmpegPath: deps.ffmpegPath,
    videoPath,
    framesDir: path.join(outDir, "frames"),
    fps: 1,
    mode: "keyframes",
    sampleWidth: 1280,
    jpegQuality: 3,
  });
  console.log(`[finder] ${frames.length} keyframes, ${known.length} known scoreboards`);

  const results: FinderResult[] = [];

  if (args.methods.includes("rapidocr")) {
    const profile = GAME_PROFILES.find((p) => p.id === spec.id);
    if (!profile) console.warn(`[finder] no harvester profile for ${spec.id}; skipping RapidOCR`);
    else if (!deps.ocrEngine) console.warn(`[finder] no OCR engine: ${deps.errors.join("; ")}`);
    else {
      const t0 = performance.now();
      // Production settings, skip-ahead included: this is the baseline as it runs today.
      const confirmed = await ocrFrames(frames, {
        engine: deps.ocrEngine,
        keywords: profile.keywords,
        keywordNoise: profile.keywordNoise,
        minKeywords: profile.defaults.minKeywords,
        endScreenSentinels: profile.endScreenSentinels,
        requireEndScreen: profile.defaults.requireEndScreen ?? false,
        dedupGapSec: profile.defaults.dedupGap / profile.defaults.fps,
        skipAheadSec: profile.defaults.minMatchIntervalSec,
        concurrency: 2,
      });
      const totalTimeMs = Math.round(performance.now() - t0);
      const scored = scoreDetections(confirmed.map((f) => f.timestampSec), known);
      results.push({
        method: `rapidocr (${deps.ocrEngine.name})`,
        threshold: null,
        ...scored,
        known: known.length,
        falsePositives: scored.falsePositiveTimes.length,
        totalTimeMs,
        frames: frames.length,
        inputTokens: null,
        costUsd: 0,
      });
    }
  }

  if (args.methods.includes("decisions")) {
    if (!process.env.OPENAI_API_KEY) console.warn("[finder] skipping Decisions: set OPENAI_API_KEY");
    else {
      const verdicts = await runDecisions(frames, spec.finderQuestion, path.join(outDir, "decisions.jsonl"));
      const totalTimeMs = wallTime(verdicts);
      const inputTokens = verdicts.reduce((n, v) => n + (v.inputTokens ?? 0), 0);
      for (const threshold of THRESHOLDS) {
        const positives = verdicts
          .filter((v) => v.probability !== null && v.probability >= threshold)
          .map((v) => v.timestampSec);
        const scored = scoreDetections(positives, known);
        results.push({
          method: `decisions (${DECISIONS.model})`,
          threshold,
          ...scored,
          known: known.length,
          falsePositives: scored.falsePositiveTimes.length,
          totalTimeMs,
          frames: verdicts.length,
          inputTokens,
          costUsd: (inputTokens * DECISIONS.inputPerM) / 1_000_000,
        });
      }
      const errors = verdicts.filter((v) => v.error).length;
      if (errors) console.warn(`[finder] ${errors} Decisions call(s) failed; rerun to retry them`);
    }
  }

  writeFinderReport(dataset, results, outDir);
  return results;
}

/**
 * One predicate call per frame, `concurrency` at a time. Results append to
 * `logPath` so an interrupted run resumes; failed frames are retried on rerun.
 */
export async function runDecisions(frames: FrameRecord[], question: string, logPath: string) {
  const done = new Map<number, FrameVerdict>();
  if (fs.existsSync(logPath))
    for (const line of fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean)) {
      const v = JSON.parse(line) as FrameVerdict;
      done.set(v.frameId, v);
    }
  const todo = frames.filter((f) => !done.has(f.frameId) || done.get(f.frameId)!.error);
  const client = new OpenAI({ maxRetries: 0 });
  const log = fs.openSync(logPath, "a");
  let next = 0;
  let finished = 0;

  const worker = async () => {
    while (next < todo.length) {
      const frame = todo[next++];
      const image = fs.readFileSync(frame.filePath).toString("base64");
      const startedAt = new Date().toISOString();
      const t0 = performance.now();
      let verdict: FrameVerdict;
      try {
        const decision = await client.decisions.create({
          model: DECISIONS.model,
          input: [
            {
              role: "user",
              content: [{ type: "input_image", image_url: `data:image/jpeg;base64,${image}` }],
            },
          ],
          questions: [{ type: "predicate", name: "is_scoreboard", instructions: question }],
        });
        const answer = decision.answers[0];
        verdict = {
          frameId: frame.frameId,
          startedAt,
          timestampSec: frame.timestampSec,
          probability: answer?.type === "predicate" ? answer.probability : null,
          latencyMs: Math.round(performance.now() - t0),
          inputTokens: decision.usage.input_tokens,
          outputTokens: decision.usage.output_tokens,
          error: answer?.type === "refusal" ? "refusal" : null,
        };
      } catch (err) {
        verdict = {
          frameId: frame.frameId,
          startedAt,
          timestampSec: frame.timestampSec,
          probability: null,
          latencyMs: Math.round(performance.now() - t0),
          inputTokens: null,
          outputTokens: null,
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        };
      }
      done.set(frame.frameId, verdict);
      fs.writeSync(log, JSON.stringify(verdict) + "\n");
      if (++finished % 50 === 0 || finished === todo.length)
        console.log(`[finder] decisions ${finished}/${todo.length}`);
    }
  };

  try {
    await Promise.all(Array.from({ length: DECISIONS.concurrency }, worker));
  } finally {
    fs.closeSync(log);
  }
  return frames.map((f) => done.get(f.frameId)!).filter(Boolean);
}

/**
 * First call start → last call end. Concurrent calls overlap, so this is the
 * real elapsed time; a resumed run includes the gap between sessions.
 */
function wallTime(verdicts: FrameVerdict[]): number {
  if (verdicts.length === 0) return 0;
  const starts = verdicts.map((v) => Date.parse(v.startedAt));
  const ends = verdicts.map((v) => Date.parse(v.startedAt) + v.latencyMs);
  return Math.max(...ends) - Math.min(...starts);
}

function writeFinderReport(dataset: Dataset, results: FinderResult[], outDir: string) {
  const fmt = (t: number) => new Date(t * 1000).toISOString().slice(11, 19);
  const md = [
    `# Scoreboard finder — ${dataset.name}`,
    "",
    `${dataset.cases.length} known scoreboards (${dataset.source.recordedMatches} matches recorded) · match window ±${MATCH_WINDOW_SEC}s · prices checked ${PRICES_CHECKED}`,
    "",
    "| Method | Threshold | Found | False positives | Frames | Total time | Input tokens | Cost / video | Weekly (×" + WEEKLY_VIDEOS + ") |",
    "|---|---|---|---|---|---|---|---|---|",
    ...results.map(
      (r) =>
        `| ${r.method} | ${r.threshold ?? "—"} | ${r.found} / ${r.known} | ${r.falsePositives} | ${r.frames} | ${(r.totalTimeMs / 60000).toFixed(1)} min | ${r.inputTokens?.toLocaleString("en-US") ?? "n/a"} | ${r.costUsd === null ? "n/a" : `$${r.costUsd.toFixed(3)}`} | ${r.costUsd === null ? "n/a" : `$${(r.costUsd * WEEKLY_VIDEOS).toFixed(2)}`} |`,
    ),
    "",
    "## To review by eye",
    "",
    ...results.flatMap((r) => [
      `- ${r.method}${r.threshold === null ? "" : ` @ ${r.threshold}`}: missed ${r.missedTimes.map(fmt).join(", ") || "none"}; extra detections at ${r.falsePositiveTimes.map(fmt).join(", ") || "none"}`,
    ]),
    "",
    "Extra detections may be real scoreboards the dataset doesn't include (e.g. forfeits); check the frames before counting them as errors.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "finder-results.md"), md);
  fs.writeFileSync(path.join(outDir, "finder-results.json"), JSON.stringify(results, null, 2));
  console.log(md);
}
