import fs from "fs";
import path from "path";
import { runSpawn } from "../utils";
import { FrameRecord } from "../types";

/**
 * Extracts frames from a video at the given fps into `framesDir` as JPEGs.
 * Uses VideoToolbox hardware acceleration on Apple Silicon for ~3x speedup.
 * Frames are normalized to 1280px wide so downstream pHash + OCR see a
 * consistent scale. If the directory already has frames, extraction is
 * skipped (resumability).
 *
 * @param args.ffmpegPath - Resolved path to ffmpeg binary.
 * @param args.videoPath - Absolute path to the input video.
 * @param args.framesDir - Where to write the JPEG sequence.
 * @param args.fps - Sampling rate (frames per second). 1 is plenty for end-game scoreboards.
 * @param args.start - Optional start time in seconds (for testing on a slice).
 * @param args.end - Optional end time in seconds.
 * @returns Array of FrameRecord, one per extracted frame.
 */
export async function sampleFrames(args: {
  ffmpegPath: string;
  videoPath: string;
  framesDir: string;
  fps: number;
  start?: number;
  end?: number;
}): Promise<FrameRecord[]> {
  const { ffmpegPath, videoPath, framesDir, fps, start, end } = args;
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
    if (end !== undefined) ffArgs.push("-t", String(end - (start ?? 0)));
    ffArgs.push("-vf", `fps=${fps},scale=1280:-2`);
    ffArgs.push("-q:v", "3");
    ffArgs.push(path.join(framesDir, "%06d.jpg"));
    await runSpawn(ffmpegPath, ffArgs);
  } else {
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
