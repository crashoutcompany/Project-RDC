import fs from "fs";
import path from "path";
import sharp from "sharp";
import { OcrRecord, MatchManifest } from "../types";
import { fmtTime } from "../utils";

/**
 * Clusters consecutive confirmed OCR records into runs and emits one PNG per
 * run. Within each run we pick the sharpest frame from the middle 60% (avoids
 * fade-in/fade-out animation frames at the edges).
 *
 * Game-agnostic: callers (index.ts) supply `gapSec` from the active
 * GameProfile so per-game scoreboard durations can vary.
 *
 * @param args.confirmed - OCR-confirmed scoreboard frames, sorted by time.
 * @param args.outDir - Where to save the match PNGs.
 * @param args.gapSec - Max timestamp gap (seconds) within a single run.
 * @returns One manifest entry per detected match.
 */
export async function dedupAndSave(args: {
  confirmed: OcrRecord[];
  outDir: string;
  gapSec: number;
}): Promise<MatchManifest[]> {
  const { confirmed, outDir, gapSec } = args;
  if (confirmed.length === 0) return [];

  const runs = clusterConsecutive(confirmed, gapSec);
  console.log(
    `[dedup] ${confirmed.length} confirmed → ${runs.length} runs (gap=${gapSec}s)`,
  );

  fs.mkdirSync(outDir, { recursive: true });

  const manifests: MatchManifest[] = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const best = await pickBestFrame(run);

    const allKeywords = Array.from(
      new Set(run.flatMap((r) => r.matchedKeywords)),
    );

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
      ocrKeywords: allKeywords,
      analysis: null,
    });
  }

  return manifests;
}

/**
 * Groups records into runs where consecutive timestamps are within `gapSec`
 * of each other.
 *
 * @param records - OCR records sorted by timestamp.
 * @param gapSec - Max gap (seconds) inside a single run.
 * @returns Array of runs (each run is an array of records).
 */
function clusterConsecutive(
  records: OcrRecord[],
  gapSec: number,
): OcrRecord[][] {
  const runs: OcrRecord[][] = [];
  let current: OcrRecord[] = [];
  let lastSec = -Infinity;
  for (const rec of records) {
    if (rec.timestampSec - lastSec > gapSec && current.length > 0) {
      runs.push(current);
      current = [];
    }
    current.push(rec);
    lastSec = rec.timestampSec;
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
async function pickBestFrame(run: OcrRecord[]): Promise<OcrRecord> {
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
 * @param imagePath - Image to score.
 * @returns Standard deviation of the Laplacian response.
 */
async function sharpnessScore(imagePath: string): Promise<number> {
  const stats = await sharp(imagePath)
    .grayscale()
    .resize(640)
    .convolve({
      width: 3,
      height: 3,
      kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
    })
    .stats();
  return stats.channels[0]?.stdev ?? 0;
}
