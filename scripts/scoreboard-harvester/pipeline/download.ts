import fs from "fs";
import path from "path";
import { runCapture, runSpawn } from "../utils";

export interface DownloadResult {
  filePath: string;
  durationSec: number;
}

/**
 * Downloads a YouTube video to `outDir/video.mp4` using yt-dlp. If the file
 * already exists the download is skipped (cheap resumability). Returns the
 * resolved file path and duration in seconds.
 *
 * Downloads video only: scoreboards are read from frames, so skipping the
 * audio stream saves bandwidth and the ffmpeg merge step.
 *
 * @param args.ytDlpPath - Resolved path to yt-dlp binary.
 * @param args.ytDlpArgs - Extra yt-dlp args (JS runtime, cookies, …).
 * @param args.ffprobePath - Resolved path to ffprobe (for duration probe).
 * @param args.url - The YouTube URL to download.
 * @param args.outDir - Where to write video.mp4.
 * @param args.maxHeight - Cap on video height; lower = faster + smaller.
 * @returns The downloaded file path and its duration in seconds.
 */
export async function downloadVideo(args: {
  ytDlpPath: string;
  ytDlpArgs?: string[];
  ffprobePath: string;
  url: string;
  outDir: string;
  maxHeight: number;
}): Promise<DownloadResult> {
  const { ytDlpPath, ytDlpArgs = [], ffprobePath, url, outDir, maxHeight } =
    args;
  fs.mkdirSync(outDir, { recursive: true });
  const target = path.join(outDir, "video.mp4");

  if (fs.existsSync(target)) {
    console.log(`[download] reusing ${target}`);
  } else {
    console.log(`[download] fetching ${url} (cap=${maxHeight}p)`);
    await runSpawn(ytDlpPath, [
      ...ytDlpArgs,
      // The live progress bar floods timer logs with carriage returns.
      ...(process.stdout.isTTY ? [] : ["--no-progress"]),
      "-f",
      `bv*[height<=${maxHeight}][ext=mp4]/bv*[height<=${maxHeight}]/b[height<=${maxHeight}]`,
      "--no-playlist",
      "-o",
      target,
      url,
    ]);
  }

  const durationSec = await probeDuration(ffprobePath, target);
  console.log(`[download] duration=${Math.round(durationSec)}s`);
  return { filePath: target, durationSec };
}

/**
 * Uses ffprobe to read the duration of a media file in seconds.
 *
 * @param ffprobePath - Resolved path to ffprobe.
 * @param file - Absolute path to the media file.
 * @returns Duration in seconds.
 */
export async function probeDuration(
  ffprobePath: string,
  file: string,
): Promise<number> {
  const out = await runCapture(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const v = parseFloat(out.trim());
  if (!Number.isFinite(v)) throw new Error(`ffprobe gave non-numeric: ${out}`);
  return v;
}
