import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

export type OcrEngineName = "vision" | "rapidocr";

/** A daemon that speaks the `--daemon` line protocol (see pipeline/ocr.ts). */
export interface OcrEngine {
  name: OcrEngineName;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface DepCheckResult {
  ok: boolean;
  ytDlpPath: string;
  /** Extra yt-dlp args (e.g. a JS runtime for YouTube's signature challenge). */
  ytDlpArgs: string[];
  ffmpegPath: string;
  ffprobePath: string;
  ocrEngine: OcrEngine | null;
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

function isExecutable(
  filePath: string,
  isWindows: boolean = process.platform === "win32",
): boolean {
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
    return "pip install --user yt-dlp (or pipx install yt-dlp, or your distro's package)";
  }
  if (platform === "darwin") return "brew install ffmpeg";
  if (platform === "win32") return "winget install ffmpeg (or choco install ffmpeg)";
  return "sudo apt install ffmpeg / sudo dnf install ffmpeg / sudo pacman -S ffmpeg";
}

/**
 * yt-dlp now needs a JavaScript runtime to solve YouTube's signature
 * challenge and only auto-detects deno. We are already running under Node, so
 * hand it this binary when the installed yt-dlp understands the flag.
 */
function ytDlpRuntimeArgs(ytDlpPath: string): string[] {
  if (which("deno")) return [];
  const help = spawnSync(ytDlpPath, ["--help"], { encoding: "utf8" });
  if (!help.stdout?.includes("--js-runtimes")) return [];
  return ["--js-runtimes", `node:${process.execPath}`];
}

function resolveOcrEngine(
  harvesterRoot: string,
  requested: OcrEngineName | "auto",
  errors: string[],
): OcrEngine | null {
  const visionOcrPath = path.join(harvesterRoot, "bin", "vision-ocr");
  const python = process.env.HARVEST_PYTHON || "python3";
  const daemon = path.join(harvesterRoot, "ocr-tool", "rapid-ocr-daemon.py");

  const wantsVision =
    requested === "vision" ||
    (requested === "auto" &&
      process.platform === "darwin" &&
      isExecutable(visionOcrPath));

  if (wantsVision) {
    if (isExecutable(visionOcrPath))
      return { name: "vision", command: visionOcrPath, args: ["--daemon"] };
    errors.push(
      `vision-ocr binary not built or not executable at ${visionOcrPath}. ` +
        `Run: pnpm harvest:build-ocr`,
    );
    return null;
  }

  const probe = spawnSync(python, ["-c", "import rapidocr, onnxruntime"], {
    encoding: "utf8",
  });
  if (probe.status === 0)
    return {
      name: "rapidocr",
      command: python,
      args: [daemon, "--daemon"],
    };

  errors.push(
    `RapidOCR not importable with ${python}. Install: ` +
      `pip install --user rapidocr onnxruntime` +
      (process.platform === "darwin"
        ? " (or build Apple Vision OCR: pnpm harvest:build-ocr)"
        : ""),
  );
  return null;
}

/**
 * Verifies that all external dependencies (yt-dlp, ffmpeg, ffprobe, an OCR
 * engine) are present. Returns a structured result so the CLI can print a
 * clear remediation message before exiting.
 *
 * @param harvesterRoot - Absolute path to the harvester directory.
 * @param requireYtDlp - Whether yt-dlp must be present (only needed for URL input).
 * @param ocrEngine - `auto` picks Apple Vision on macOS, RapidOCR elsewhere;
 *   `none` skips the OCR check (the AI finder needs no OCR).
 */
export function checkDeps(
  harvesterRoot: string,
  requireYtDlp: boolean,
  ocrEngine: OcrEngineName | "auto" | "none" = "auto",
): DepCheckResult {
  const errors: string[] = [];

  const ytDlpPath = which("yt-dlp");
  if (requireYtDlp && !ytDlpPath)
    errors.push(`yt-dlp not found on PATH. Install: ${installHint("yt-dlp")}`);

  const ffmpegPath = which("ffmpeg");
  if (!ffmpegPath)
    errors.push(`ffmpeg not found on PATH. Install: ${installHint("ffmpeg")}`);

  const ffprobePath = which("ffprobe");
  if (!ffprobePath)
    errors.push(
      `ffprobe not found on PATH (ships with ffmpeg). Install: ${installHint("ffmpeg")}`,
    );

  const engine =
    ocrEngine === "none"
      ? null
      : resolveOcrEngine(harvesterRoot, ocrEngine, errors);

  return {
    ok: errors.length === 0,
    ytDlpPath: ytDlpPath ?? "",
    ytDlpArgs: ytDlpPath ? ytDlpRuntimeArgs(ytDlpPath) : [],
    ffmpegPath: ffmpegPath ?? "",
    ffprobePath: ffprobePath ?? "",
    ocrEngine: engine,
    errors,
  };
}
