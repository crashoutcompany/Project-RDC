import fs from "fs";
import path from "path";
import { runSpawn } from "../utils";
import { FrameRecord } from "../types";

/**
 * Extracts frames from a video at the given fps into `framesDir` as JPEGs.
 * Uses VideoToolbox hardware acceleration on Apple Silicon for ~3x speedup.
 * Frames are normalized to 1280px wide so downstream pHash + OCR see a
 * consistent scale. If the directory already has frames, extraction is
 * skipped (resumability) — but the frame count is sanity-checked against
 * the expected duration to detect a previously-interrupted extraction.
 *
 * @param args.ffmpegPath - Resolved path to ffmpeg binary.
 * @param args.videoPath - Absolute path to the input video.
 * @param args.framesDir - Where to write the JPEG sequence.
 * @param args.fps - Sampling rate (frames per second). 1 is plenty for end-game scoreboards.
 * @param args.start - Optional start time in seconds (for testing on a slice).
 * @param args.end - Optional end time in seconds.
 * @param args.durationSec - Optional source duration; used to sanity-check
 *   reused frame counts on resume. Skipped when undefined.
 * @returns Array of FrameRecord, one per extracted frame.
 */
export async function sampleFrames(args: {
  ffmpegPath: string;
  videoPath: string;
  framesDir: string;
  fps: number;
  start?: number;
  end?: number;
  durationSec?: number;
}): Promise<FrameRecord[]> {
  const { ffmpegPath, videoPath, framesDir, fps, start, end, durationSec } =
    args;
  fs.mkdirSync(framesDir, { recursive: true });

  const existing = fs
    .readdirSync(framesDir)
    .filter((f) => f.endsWith(".jpg"))
    .sort();

  if (existing.length === 0) {
    console.log(`[sample] extracting frames at ${fps} fps`);
    const ffArgs: string[] = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-stats",
      "-hwaccel",
      "videotoolbox",
    ];
    if (start !== undefined) ffArgs.push("-ss", String(start));
    ffArgs.push("-i", videoPath);
    if (end !== undefined) {
      const duration = end - (start ?? 0);
      // ffmpeg silently produces zero output for `-t 0` or negative durations;
      // fail loudly so users notice swapped --start/--end immediately.
      if (!(duration > 0)) {
        throw new Error(
          `Invalid slice: --end (${end}) must be greater than --start ` +
            `(${start ?? 0}). Got duration=${duration}.`,
        );
      }
      ffArgs.push("-t", String(duration));
    }
    ffArgs.push("-vf", `fps=${fps},scale=1280:-2`);
    ffArgs.push("-q:v", "3");
    ffArgs.push(path.join(framesDir, "%06d.jpg"));
    await runSpawn(ffmpegPath, ffArgs);
  } else {
    // Detect previously-interrupted extractions. We don't auto-delete because
    // the user might be running with an intentional --end slice change; warn
    // loudly and tell them how to recover.
    if (durationSec !== undefined && durationSec > 0) {
      const sliceSec = (end ?? durationSec) - (start ?? 0);
      const expected = Math.floor(sliceSec * fps);
      const lower = Math.floor(expected * 0.9);
      const upper = Math.ceil(expected * 1.1);
      if (existing.length < lower || existing.length > upper) {
        console.warn(
          `[sample] WARNING: reusing ${existing.length} frames but expected ~${expected} ` +
            `for a ${Math.round(sliceSec)}s slice at ${fps} fps.`,
        );
        console.warn(
          `[sample] A previous extraction was likely interrupted. To re-extract, run:`,
        );
        console.warn(`[sample]   rm -rf ${framesDir}`);
        console.warn(
          `[sample] (or pass a different --start/--end if this is intentional).`,
        );
      }
    }
    console.log(`[sample] reusing ${existing.length} frames`);
  }

  const files = fs
    .readdirSync(framesDir)
    .filter((f) => f.endsWith(".jpg"))
    .sort();

  return files.map((f, i) => ({
    frameId: i + 1,
    filePath: path.join(framesDir, f),
    timestampSec: (start ?? 0) + i / fps,
  }));
}
