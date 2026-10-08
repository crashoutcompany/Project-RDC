import fs from "fs";
import path from "path";
import sharp from "sharp";
import { DetectionRecord, FrameRecord, MatchManifest } from "../types";
import { fmtTime } from "../utils";

/**
 * Clusters consecutive confirmed detection records into runs and emits one PNG per
 * run. Within each run we pick the sharpest frame from the middle 60% (avoids
 * fade-in/fade-out animation frames at the edges).
 *
 * Game-agnostic: callers (index.ts) supply `gapTolerance` from the active
 * GameProfile so per-game scoreboard durations can vary.
 *
 * @param args.confirmed - Detector-confirmed scoreboard frames, sorted by frameId.
 * @param args.outDir - Where to save the match PNGs.
 * @param args.gapTolerance - Max frame gap allowed within a single run.
 * @param args.detection - Which detector (and model) produced `confirmed`.
 * @returns One manifest entry per detected match.
 */
export async function dedupAndSave(args: {
  confirmed: DetectionRecord[];
  outDir: string;
  gapTolerance: number;
  detection: { detector: "ocr" | "ai"; model?: string };
}): Promise<MatchManifest[]> {
  const { confirmed, outDir, gapTolerance, detection } = args;
  if (confirmed.length === 0) return [];

  const runs = clusterConsecutive(confirmed, gapTolerance);
  console.log(
    `[dedup] ${confirmed.length} confirmed → ${runs.length} runs (gap=${gapTolerance})`,
  );

  fs.mkdirSync(outDir, { recursive: true });

  const manifests: MatchManifest[] = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const best = await pickBestFrame(run);

    const evidence = Array.from(new Set(run.flatMap((r) => r.evidence)));

    const matchNo = String(i + 1).padStart(2, "0");
    const fileName = `match-${matchNo}_t=${fmtTime(best.timestampSec)}.png`;
    const destPath = path.join(outDir, fileName);

    await sharp(best.filePath).png().toFile(destPath);

    manifests.push({
      match: i + 1,
      timestampSec: best.timestampSec,
      timestampStr: fmtTime(best.timestampSec).replace(/-/g, ":"),
      runLengthFrames: run.length,
      imagePath: fileName,
      ocrKeywords: detection.detector === "ocr" ? evidence : [],
      detection: {
        ...detection,
        evidence,
        confidence: best.confidence,
      },
      submission: null,
    });
  }

  return manifests;
}

/**
 * Groups records into runs where consecutive frame IDs are within
 * `gapTolerance` of each other.
 *
 * @param records - Records sorted by frameId.
 * @param gapTolerance - Max frame gap inside a single run.
 * @returns Array of runs (each run is an array of records).
 */
export function clusterConsecutive<T extends FrameRecord>(
  records: T[],
  gapTolerance: number,
): T[][] {
  const runs: T[][] = [];
  let current: T[] = [];
  let lastFrame = -Infinity;
  for (const rec of records) {
    if (rec.frameId - lastFrame > gapTolerance && current.length > 0) {
      runs.push(current);
      current = [];
    }
    current.push(rec);
    lastFrame = rec.frameId;
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/**
 * From a single run, picks the frame with highest variance-of-laplacian
 * sharpness within the middle 60% of the run (avoids fade transitions).
 *
 * @param run - A run of confirmed frames belonging to the same match.
 * @returns The best frame in the run.
 */
async function pickBestFrame(
  run: DetectionRecord[],
): Promise<DetectionRecord> {
  const lo = Math.floor(run.length * 0.2);
  const hi = Math.max(lo + 1, Math.ceil(run.length * 0.8));
  const window = run.slice(lo, hi);
  let best = window[0];
  let bestScore = -1;
  for (const rec of window) {
    const score = await sharpnessScore(rec.filePath);
    if (score > bestScore) {
      bestScore = score;
      best = rec;
    }
  }
  return best;
}

/**
 * Computes variance-of-laplacian as a proxy for image sharpness. Higher is
 * sharper. Used to break ties among frames in the same run.
 *
 * Pixels are materialized with `.raw().toBuffer()` — sharp's `.stats()`
 * reports on the *input* image, ignoring the convolve/resize above it, which
 * silently scored every frame as flat. `scale: 1` and `offset: 128` keep the
 * kernel's zero-sum, signed output from clamping to 0.
 *
 * @param imagePath - Image to score.
 * @returns Standard deviation of the Laplacian response.
 */
export async function sharpnessScore(imagePath: string): Promise<number> {
  const { data } = await sharp(imagePath)
    .grayscale()
    .resize(640)
    .convolve({
      width: 3,
      height: 3,
      kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
      scale: 1,
      offset: 128,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  let sumSq = 0;
  for (const value of data) {
    sum += value;
    sumSq += value * value;
  }
  const mean = sum / data.length;
  return Math.sqrt(Math.max(0, sumSq / data.length - mean * mean));
}
