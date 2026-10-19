import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { runCapture, runSpawn } from "../utils";
import { FrameRecord } from "../types";

const KEYFRAME_INDEX = "keyframes.json";

/**
 * Extracts frames from a video into `framesDir` as JPEGs.
 *
 * - `fps` mode samples at a fixed rate. It decodes with VideoToolbox on macOS
 *   (~3x speedup on Apple Silicon) and in software elsewhere, unless `hwaccel`
 *   names a specific ffmpeg hwaccel.
 * - `keyframes` mode decodes only I-frames, which is ~100x less work and the
 *   difference between minutes and an hour on a Raspberry Pi. Timestamps come
 *   from ffmpeg's showinfo filter and are saved next to the frames.
 *
 * Frames are normalized to a fixed width so downstream pHash + OCR see a
 * consistent scale. If the directory already has frames, extraction is
 * skipped (resumability) — but the frame count is sanity-checked against
 * the expected duration to detect a previously-interrupted extraction.
 *
 * @param args.ffmpegPath - Resolved path to ffmpeg binary.
 * @param args.videoPath - Absolute path to the input video.
 * @param args.framesDir - Where to write the JPEG sequence.
 * @param args.fps - Sampling rate (frames per second). 1 is plenty for end-game scoreboards.
 * @param args.mode - `fps` or `keyframes`.
 * @param args.sampleWidth - Output JPEG width in pixels.
 * @param args.jpegQuality - ffmpeg JPEG quality. Lower is higher quality.
 * @param args.hwaccel - Optional ffmpeg `-hwaccel` value for `fps` mode (e.g.
 *   cuda, vaapi, auto). "none" forces software decoding. Defaults per platform.
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
  mode?: "fps" | "keyframes";
  sampleWidth: number;
  jpegQuality: number;
  hwaccel?: string;
  start?: number;
  end?: number;
  durationSec?: number;
}): Promise<FrameRecord[]> {
  if (args.mode === "keyframes") return sampleKeyframes(args);

  const {
    ffmpegPath,
    videoPath,
    framesDir,
    fps,
    sampleWidth,
    jpegQuality,
    hwaccel = defaultHwaccel(),
    start,
    end,
    durationSec,
  } = args;
  fs.mkdirSync(framesDir, { recursive: true });

  const existing = fs
    .readdirSync(framesDir)
    .filter((f) => f.endsWith(".jpg"))
    .sort();

  if (existing.length === 0) {
    console.log(
      `[sample] extracting frames at ${fps} fps, width=${sampleWidth}, q=${jpegQuality}`,
    );
    const ffArgs: string[] = ["-hide_banner", "-loglevel", "error", "-stats"];
    if (hwaccel !== "none") ffArgs.push("-hwaccel", hwaccel);
    if (start !== undefined) ffArgs.push("-ss", String(start));
    ffArgs.push("-i", videoPath);
    ffArgs.push("-map", "0:v:0", "-an", "-sn", "-dn");
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
    ffArgs.push("-vf", `fps=${fps},scale=${sampleWidth}:-2`);
    ffArgs.push("-q:v", String(jpegQuality));
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

/** VideoToolbox is always present on macOS; elsewhere GPU decode setups vary too much to assume one. */
function defaultHwaccel(): string {
  return process.platform === "darwin" ? "videotoolbox" : "none";
}

/**
 * VP8 and VP9 ignore `-skip_frame nokey` and emit every frame. Those codecs
 * select I-frames in the filter graph instead, which does decode the video.
 */
export function keyframeVf(codec: string, sampleWidth: number): { skipNonKey: boolean; vf: string } {
  const selectI = codec === "vp8" || codec === "vp9";
  const scale = `scale=${sampleWidth}:-2`;
  if (selectI) return { skipNonKey: false, vf: `select='eq(pict_type,I)',showinfo,${scale}` };
  return { skipNonKey: true, vf: `showinfo,${scale}` };
}

/** ffmpeg args for one keyframe pass. `codec` chooses the skip strategy. */
export function keyframeExtractArgs(args: {
  videoPath: string;
  framesDir: string;
  sampleWidth: number;
  jpegQuality: number;
  codec: string;
}): string[] {
  const { skipNonKey, vf } = keyframeVf(args.codec, args.sampleWidth);
  const ffArgs = ["-hide_banner"];
  if (skipNonKey) ffArgs.push("-skip_frame", "nokey");
  ffArgs.push(
    "-i",
    args.videoPath,
    "-map",
    "0:v:0",
    "-an",
    "-sn",
    "-dn",
    "-fps_mode",
    "passthrough",
    "-vf",
    vf,
    "-q:v",
    String(args.jpegQuality),
    path.join(args.framesDir, "%06d.jpg"),
  );
  return ffArgs;
}

async function videoCodec(videoPath: string): Promise<string> {
  const out = await runCapture("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name",
    "-of",
    "csv=p=0",
    videoPath,
  ]);
  return out.trim().split("\n")[0] ?? "";
}

/**
 * Keyframe-only extraction. `--start`/`--end` apply to the saved timestamps,
 * so a reused frames dir stays valid across slice changes. AV1 and H.264 skip
 * non-keyframes in the decoder. VP8/VP9 cannot, so they select I-frames.
 */
async function sampleKeyframes(args: {
  ffmpegPath: string;
  videoPath: string;
  framesDir: string;
  sampleWidth: number;
  jpegQuality: number;
  start?: number;
  end?: number;
}): Promise<FrameRecord[]> {
  const { ffmpegPath, videoPath, framesDir, sampleWidth, jpegQuality } = args;
  const indexPath = path.join(framesDir, KEYFRAME_INDEX);
  let timestamps: number[];

  if (fs.existsSync(indexPath)) {
    timestamps = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    console.log(`[sample] reusing ${timestamps.length} keyframes`);
  } else {
    // A frames dir without an index is a half-finished extraction.
    fs.rmSync(framesDir, { recursive: true, force: true });
    fs.mkdirSync(framesDir, { recursive: true });
    const codec = await videoCodec(videoPath);
    console.log(
      `[sample] extracting keyframes only, codec=${codec || "unknown"}, width=${sampleWidth}, q=${jpegQuality}`,
    );
    timestamps = await extractKeyframes({
      ffmpegPath,
      ffArgs: keyframeExtractArgs({ videoPath, framesDir, sampleWidth, jpegQuality, codec }),
    });
    const written = fs
      .readdirSync(framesDir)
      .filter((f) => f.endsWith(".jpg")).length;
    if (written !== timestamps.length)
      throw new Error(
        `[sample] ffmpeg wrote ${written} keyframes but reported ${timestamps.length} timestamps`,
      );
    if (timestamps.length >= 2) {
      const span = timestamps[timestamps.length - 1] - timestamps[0];
      const rate = timestamps.length / Math.max(span, 1);
      if (rate > 4) {
        fs.rmSync(framesDir, { recursive: true, force: true });
        throw new Error(
          `[sample] keyframe extract wrote ${timestamps.length} frames over ${span.toFixed(0)}s (${rate.toFixed(1)}/s). That is every frame, not I-frames.`,
        );
      }
    }
    fs.writeFileSync(indexPath, JSON.stringify(timestamps));
    console.log(`[sample] ${timestamps.length} keyframes extracted`);
  }

  const frames = timestamps.map((timestampSec, i) => ({
    frameId: i + 1,
    filePath: path.join(framesDir, `${String(i + 1).padStart(6, "0")}.jpg`),
    timestampSec,
  }));
  return frames.filter(
    (frame) =>
      (args.start === undefined || frame.timestampSec >= args.start) &&
      (args.end === undefined || frame.timestampSec < args.end),
  );
}

/** Runs ffmpeg and collects `pts_time` from showinfo's per-frame log lines. */
function extractKeyframes(args: {
  ffmpegPath: string;
  ffArgs: string[];
}): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(args.ffmpegPath, args.ffArgs);
    const timestamps: number[] = [];
    let buffer = "";
    let tail = "";
    proc.stderr.on("data", (chunk) => {
      buffer += String(chunk);
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const match = line.match(/\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:(-?[\d.]+)/);
        if (match) timestamps.push(parseFloat(match[1]));
        else tail = (tail + line + "\n").slice(-2000);
        newline = buffer.indexOf("\n");
      }
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(timestamps);
      else reject(new Error(`ffmpeg exited with code ${code}: ${tail.trim()}`));
    });
  });
}
