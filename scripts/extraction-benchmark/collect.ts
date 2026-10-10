import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import prisma from "prisma/db";
import { checkDeps } from "../scoreboard-harvester/pipeline/deps";
import { downloadVideo } from "../scoreboard-harvester/pipeline/download";
import { sampleFrames } from "../scoreboard-harvester/pipeline/sample";
import { BENCH_DIR } from "./config";
import { resolveGame } from "./games";
import { runDecisions } from "./finder";

/** Frames more than this many seconds apart belong to different scoreboards. */
const RUN_GAP_SEC = 20;
const THRESHOLD = 0.5;

export interface Detection {
  /** 1-based, in video order. */
  index: number;
  startSec: number;
  endSec: number;
  frameSec: number;
  probability: number;
  imagePath: string;
}

export interface Collection {
  sessionId: number;
  game: string;
  videoId: string;
  /** Scoreboards in the database for this session, in play order. */
  dbMatches: number;
  detections: Detection[];
  /** detections.length === dbMatches. */
  countMatches: boolean;
}

/**
 * Finds the database session's video, reads every keyframe with Decisions,
 * groups positive frames into scoreboards, and saves one PNG per scoreboard.
 * The count is compared to the database's match count; a mismatch is reported,
 * not corrected.
 */
export async function collect(args: { sessionId: number; game: string; videoId: string }): Promise<Collection> {
  const spec = resolveGame(args.game);
  const dir = path.join(BENCH_DIR, "collect", `${args.game}-s${args.sessionId}`);
  fs.mkdirSync(dir, { recursive: true });
  const videos = path.join(os.homedir(), "ocrbench", "videos");
  const dbMatches = await countMatches(args.sessionId);

  const deps = checkDeps(path.resolve(import.meta.dirname, "../scoreboard-harvester"), true);
  if (!deps.ffmpegPath || !deps.ffprobePath) throw new Error(deps.errors.join("\n"));
  const existing = path.join(videos, `${args.videoId}.mp4`);
  const video = fs.existsSync(existing)
    ? existing
    : (
        await downloadVideo({
          ytDlpPath: deps.ytDlpPath,
          ytDlpArgs: deps.ytDlpArgs,
          ffprobePath: deps.ffprobePath,
          url: `https://www.youtube.com/watch?v=${args.videoId}`,
          outDir: videos,
          maxHeight: 720,
        })
      ).filePath;

  const frames = await sampleFrames({
    ffmpegPath: deps.ffmpegPath,
    videoPath: video,
    framesDir: path.join(dir, "frames"),
    fps: 1,
    mode: "keyframes",
    sampleWidth: 1280,
    jpegQuality: 3,
  });
  console.log(`[collect] ${frames.length} keyframes, ${dbMatches} matches in DB`);

  const verdicts = await runDecisions(frames, spec.finderQuestion, path.join(dir, "decisions.jsonl"));
  const detections = await groupDetections(verdicts, dir);
  const result: Collection = {
    sessionId: args.sessionId,
    game: args.game,
    videoId: args.videoId,
    dbMatches,
    detections,
    countMatches: detections.length === dbMatches,
  };
  fs.writeFileSync(path.join(dir, "collection.json"), JSON.stringify(result, null, 2));
  console.log(
    `[collect] ${detections.length} scoreboards found, ${dbMatches} in DB → ${result.countMatches ? "MATCH" : "MISMATCH"}`,
  );
  await prisma.$disconnect();
  return result;
}

type Verdict = { timestampSec: number; probability: number | null; frameId: number };

/** Positive frames → scoreboards. Each scoreboard's image is its most confident frame, earliest on ties. */
async function groupDetections(verdicts: Verdict[], dir: string): Promise<Detection[]> {
  const positives = verdicts
    .filter((v) => v.probability !== null && v.probability >= THRESHOLD)
    .sort((a, b) => a.timestampSec - b.timestampSec);
  const runs: Verdict[][] = [];
  for (const v of positives) {
    const last = runs.at(-1);
    if (last && v.timestampSec - last.at(-1)!.timestampSec <= RUN_GAP_SEC) last.push(v);
    else runs.push([v]);
  }
  const out: Detection[] = [];
  for (const [i, run] of runs.entries()) {
    const best = run.reduce((a, b) =>
      b.probability! > a.probability! ? b : a,
    );
    const name = `match-${String(i + 1).padStart(2, "0")}.png`;
    const frame = path.join(dir, "frames", `${String(best.frameId).padStart(6, "0")}.jpg`);
    await sharp(frame).png().toFile(path.join(dir, name));
    out.push({
      index: i + 1,
      startSec: run[0].timestampSec,
      endSec: run.at(-1)!.timestampSec,
      frameSec: best.timestampSec,
      probability: best.probability!,
      imagePath: path.join(dir, name),
    });
  }
  return out;
}

async function countMatches(sessionId: number): Promise<number> {
  return prisma.match.count({ where: { set: { sessionId } } });
}

/** Count check across every collected session: detections vs database matches. */
export function summarizeCollections(): string {
  const root = path.join(BENCH_DIR, "collect");
  if (!fs.existsSync(root)) return "No collections yet.";
  const rows = fs
    .readdirSync(root)
    .map((d) => path.join(root, d, "collection.json"))
    .filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, "utf8")) as Collection)
    .sort((a, b) => a.game.localeCompare(b.game) || a.sessionId - b.sessionId);
  const header = "| Game | Session | Video | DB matches | Decisions found | Count matches |";
  return [
    header,
    "|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.game} | ${r.sessionId} | ${r.videoId} | ${r.dbMatches} | ${r.detections.length} | ${r.countMatches ? "yes" : "NO"} |`,
    ),
  ].join("\n");
}
