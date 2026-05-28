import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

export interface DepCheckResult {
  ok: boolean;
  ytDlpPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  visionOcrPath: string;
  errors: string[];
}

/**
 * Locates a binary on PATH using `command -v`. `cmd` is passed as a positional
 * argument to /bin/sh, NOT interpolated into the script body, so shell
 * metacharacters in `cmd` are not evaluated — safe even if a future caller
 * forwards user input here.
 *
 * @param cmd - The binary name to resolve.
 * @returns The absolute path, or null if not found.
 */
function which(cmd: string): string | null {
  const result = spawnSync(
    "/bin/sh",
    ["-c", 'command -v "$1"', "sh", cmd],
    { encoding: "utf8" },
  );
  if (result.status === 0) {
    return result.stdout.trim() || null;
  }
  return null;
}

/**
 * Verifies that all external dependencies (yt-dlp, ffmpeg, ffprobe,
 * vision-ocr) are present. Returns a structured result so the CLI can print
 * a clear remediation message before exiting.
 *
 * @param harvesterRoot - Absolute path to the harvester directory.
 * @param requireYtDlp - Whether yt-dlp must be present (only needed for URL input).
 * @returns DepCheckResult with resolved paths and any errors.
 */
export function checkDeps(
  harvesterRoot: string,
  requireYtDlp: boolean,
): DepCheckResult {
  const errors: string[] = [];

  const ytDlpPath = which("yt-dlp");
  if (requireYtDlp && !ytDlpPath) {
    errors.push("yt-dlp not found on PATH. Install: brew install yt-dlp");
  }

  const ffmpegPath = which("ffmpeg");
  if (!ffmpegPath) {
    errors.push("ffmpeg not found on PATH. Install: brew install ffmpeg");
  }

  const ffprobePath = which("ffprobe");
  if (!ffprobePath) {
    errors.push("ffprobe not found on PATH. Install: brew install ffmpeg");
  }

  const visionOcrPath = path.join(harvesterRoot, "bin", "vision-ocr");
  if (!fs.existsSync(visionOcrPath)) {
    errors.push(
      `vision-ocr binary not built. Run: cd scripts/scoreboard-harvester/ocr-tool && ./build.sh`,
    );
  }

  return {
    ok: errors.length === 0,
    ytDlpPath: ytDlpPath ?? "",
    ffmpegPath: ffmpegPath ?? "",
    ffprobePath: ffprobePath ?? "",
    visionOcrPath,
    errors,
  };
}
