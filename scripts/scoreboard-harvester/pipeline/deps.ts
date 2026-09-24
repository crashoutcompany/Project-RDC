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

type Tool = "yt-dlp" | "ffmpeg";

/**
 * Locates a binary on PATH without shelling out, so it works the same on
 * macOS, Linux, and native Windows (where `/bin/sh` doesn't exist and
 * executables carry a PATHEXT suffix like `.exe`).
 *
 * @param cmd - The binary name to resolve.
 * @param env - Environment to read PATH/PATHEXT from (injectable for tests).
 * @param platform - Platform to resolve for (injectable for tests).
 * @returns The absolute path, or null if not found.
 */
export function which(
  cmd: string,
  env: Partial<NodeJS.ProcessEnv> = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const isWindows = platform === "win32";
  const dirs = (env.PATH ?? env.Path ?? "")
    .split(isWindows ? ";" : ":")
    .filter(Boolean);
  const exts = isWindows
    ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)]
    : [""];

  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + ext);
      if (isExecutable(candidate, isWindows)) return candidate;
    }
  }
  return null;
}

function isExecutable(filePath: string, isWindows: boolean): boolean {
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    // Windows has no exec bit; a matching PATHEXT suffix is what makes it runnable.
    if (!isWindows) fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Per-platform install hint for a missing tool.
 *
 * @param tool - The missing tool.
 * @param platform - Platform to tailor the hint for.
 * @returns A one-line remediation hint.
 */
export function installHint(
  tool: Tool,
  platform: NodeJS.Platform = process.platform,
): string {
  if (tool === "yt-dlp") {
    if (platform === "darwin") return "brew install yt-dlp (or pipx install yt-dlp)";
    if (platform === "win32") return "winget install yt-dlp (or pipx install yt-dlp)";
    return "pipx install yt-dlp (or your distro's yt-dlp package)";
  }
  if (platform === "darwin") return "brew install ffmpeg";
  if (platform === "win32") return "winget install ffmpeg (or choco install ffmpeg)";
  return "sudo apt install ffmpeg / sudo dnf install ffmpeg / sudo pacman -S ffmpeg";
}

/** Absolute path where `pnpm harvest:build-ocr` writes the macOS OCR binary. */
export function visionOcrBinPath(harvesterRoot: string): string {
  return path.join(harvesterRoot, "bin", "vision-ocr");
}

/**
 * Whether the Apple Vision OCR binary is built and runnable. existsSync alone
 * lets non-executable files slip through and fail at spawn-time with a noisy
 * EACCES, so probe with X_OK.
 */
export function isVisionOcrUsable(harvesterRoot: string): boolean {
  if (process.platform !== "darwin") return false;
  try {
    fs.accessSync(visionOcrBinPath(harvesterRoot), fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifies that the external dependencies the chosen run needs are present.
 * Returns a structured result so the CLI can print a clear remediation
 * message before exiting.
 *
 * @param harvesterRoot - Absolute path to the harvester directory.
 * @param opts.requireYtDlp - Whether yt-dlp must be present (only needed for URL input).
 * @param opts.requireVisionOcr - Whether the macOS vision-ocr binary must be
 *   present (only for `--detector ocr`).
 * @returns DepCheckResult with resolved paths and any errors.
 */
export function checkDeps(
  harvesterRoot: string,
  opts: { requireYtDlp: boolean; requireVisionOcr: boolean },
): DepCheckResult {
  const errors: string[] = [];

  const ytDlpPath = which("yt-dlp");
  if (opts.requireYtDlp && !ytDlpPath)
    errors.push(`yt-dlp not found on PATH. Install: ${installHint("yt-dlp")}`);

  const ffmpegPath = which("ffmpeg");
  if (!ffmpegPath)
    errors.push(`ffmpeg not found on PATH. Install: ${installHint("ffmpeg")}`);

  const ffprobePath = which("ffprobe");
  if (!ffprobePath)
    errors.push(
      `ffprobe not found on PATH (ships with ffmpeg). Install: ${installHint("ffmpeg")}`,
    );

  const visionOcrPath = visionOcrBinPath(harvesterRoot);
  if (opts.requireVisionOcr) {
    if (process.platform !== "darwin")
      errors.push(
        "--detector ocr uses Apple's Vision framework and only runs on macOS. " +
          "Use --detector ai instead.",
      );
    else if (!isVisionOcrUsable(harvesterRoot))
      errors.push(
        `vision-ocr binary not built or not executable at ${visionOcrPath}. ` +
          `Run: pnpm harvest:build-ocr`,
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
