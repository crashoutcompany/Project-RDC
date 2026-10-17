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

function isExecutable(file: string): boolean {
  // existsSync alone lets non-executable files slip through and fail at
  // spawn-time with a noisy EACCES.
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
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
 * @param ocrEngine - `auto` picks Apple Vision on macOS, RapidOCR elsewhere.
 */
export function checkDeps(
  harvesterRoot: string,
  requireYtDlp: boolean,
  ocrEngine: OcrEngineName | "auto" = "auto",
): DepCheckResult {
  const errors: string[] = [];
  const install =
    process.platform === "darwin" ? "brew install" : "sudo apt install";

  const ytDlpPath = which("yt-dlp");
  if (requireYtDlp && !ytDlpPath) {
    errors.push(
      "yt-dlp not found on PATH. Install: " +
        (process.platform === "darwin"
          ? "brew install yt-dlp"
          : "pip install --user yt-dlp"),
    );
  }

  const ffmpegPath = which("ffmpeg");
  if (!ffmpegPath) {
    errors.push(`ffmpeg not found on PATH. Install: ${install} ffmpeg`);
  }

  const ffprobePath = which("ffprobe");
  if (!ffprobePath) {
    errors.push(`ffprobe not found on PATH. Install: ${install} ffmpeg`);
  }

  const engine = resolveOcrEngine(harvesterRoot, ocrEngine, errors);

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
