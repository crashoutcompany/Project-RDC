import fs from "fs";
import path from "path";
import sharp from "sharp";
import { OcrRecord, MatchManifest } from "../types";
import { fmtTime } from "../utils";

/**
 * Clusters consecutive confirmed OCR records into runs and emits one PNG per
 * run. Within each run we keep the earliest frame (see `pickBestFrame`).
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
 * From a single run, picks the earliest frame, breaking near-ties on
 * sharpness. Players who leave during the post-match countdown vanish from
 * the scoreboard, so later frames can be missing rows (seen on RL session 13:
 * 6 rows at the first frame, 3 by the middle of the run). Every frame in a run
 * was already confirmed legible by the finder, so the first one isn't a fade.
 * The second frame is taken only when the first is clearly blurrier.
 *
 * @param run - A run of confirmed frames belonging to the same match.
 * @returns The best frame in the run.
 */
async function pickBestFrame(run: OcrRecord[]): Promise<OcrRecord> {
  if (run.length < 2) return run[0];
  const [first, second] = await Promise.all(
    run.slice(0, 2).map((rec) => sharpnessScore(rec.filePath)),
  );
  return first >= second * 0.7 ? run[0] : run[1];
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
