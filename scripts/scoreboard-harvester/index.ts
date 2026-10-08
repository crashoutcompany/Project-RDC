#!/usr/bin/env tsx
/**
 * RDC Scoreboard Harvester.
 *
 * Downloads (or accepts) a video, extracts end-of-match scoreboard
 * screenshots, and writes one PNG per detected match. Game-agnostic — the
 * actual scoreboard recognition is driven by a per-game profile in games/.
 * Detection runs on any OS with a vision model (`--detector ai`), or with
 * Apple Vision OCR on macOS (`--detector ocr`). See README.md for full docs.
 *
 *   pnpm harvest -- extract  --game rocket-league --url <youtube>
 *   pnpm harvest -- bootstrap --game rocket-league --from ./shot.png
 */
import "./load-env";
import { parseArgs } from "util";
import path from "path";
import fs from "fs";
import sharp from "sharp";

import { getVisionModelSpec } from "@/lib/vision/models";
import { checkDeps, isVisionOcrUsable } from "./pipeline/deps";
import { downloadVideo, probeDuration } from "./pipeline/download";
import { sampleFrames } from "./pipeline/sample";
import { filterByPHash, loadReferenceHash } from "./pipeline/phash";
import {
  detectFrames,
  selectRefineFrames,
  type FrameClassifier,
} from "./pipeline/detect";
import { createOcrClassifier } from "./pipeline/classifiers/ocr";
import { createAiClassifier } from "./pipeline/classifiers/ai";
import { clusterConsecutive, dedupAndSave } from "./pipeline/dedup";
import { submitMatches } from "./pipeline/submit";
import { parseFiniteNumber, sanitizeUrl, urlToSlug } from "./utils";
import {
  DetectionRecord,
  FrameRecord,
  Manifest,
  ResolvedConfig,
} from "./types";
import { DEFAULT_GAME_ID, listGameIds, resolveProfile } from "./games/registry";
import type { GameProfile } from "./games/types";

const HARVESTER_ROOT = import.meta.dirname;
const COMMANDS = ["extract", "bootstrap"] as const;
const DEFAULT_SAMPLE_WIDTH = 1280;
const DEFAULT_JPEG_QUALITY = 3;
const DEFAULT_DETECT_CONCURRENCY = 2;
const DEFAULT_AI_STRIDE_SEC = 4;
const DEFAULT_AI_GRID = 3;
const DEFAULT_AI_MIN_CONFIDENCE = 0.6;
const DETECTORS = ["auto", "ocr", "ai"] as const;
type Command = (typeof COMMANDS)[number];

interface ParsedArgs {
  command: Command;
  profile: GameProfile;
  url?: string;
  video?: string;
  from?: string;
  config: ResolvedConfig;
}

/**
 * Parses CLI arguments into a typed shape. Exits with usage on --help or bad input.
 *
 * @returns Parsed command, source, resolved profile, and resolved configuration.
 */
function parseInputs(): ParsedArgs {
  const argv = process.argv.slice(2);

  if (argv[0] === "--") argv.shift();
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      game: { type: "string", default: DEFAULT_GAME_ID },
      url: { type: "string" },
      video: { type: "string" },
      from: { type: "string" },
      out: { type: "string", default: "./out" },
      fps: { type: "string" },
      "no-phash": { type: "boolean", default: false },
      "phash-threshold": { type: "string", default: "12" },
      "ocr-min-keywords": { type: "string" },
      "require-end-screen": { type: "boolean", default: false },
      "dedup-gap": { type: "string" },
      "skip-ahead-sec": { type: "string" },
      "no-skip-ahead": { type: "boolean", default: false },
      quality: { type: "string", default: "720" },
      "sample-width": { type: "string", default: String(DEFAULT_SAMPLE_WIDTH) },
      "jpeg-quality": { type: "string", default: String(DEFAULT_JPEG_QUALITY) },
      detector: { type: "string", default: "auto" },
      "detect-model": { type: "string" },
      "detect-concurrency": { type: "string" },
      // Pre-AI name for --detect-concurrency, kept as an alias.
      "ocr-concurrency": { type: "string" },
      "ai-stride-sec": {
        type: "string",
        default: String(DEFAULT_AI_STRIDE_SEC),
      },
      "ai-grid": { type: "string", default: String(DEFAULT_AI_GRID) },
      "ai-min-confidence": {
        type: "string",
        default: String(DEFAULT_AI_MIN_CONFIDENCE),
      },
      "no-refine": { type: "boolean", default: false },
      hwaccel: { type: "string" },
      draft: { type: "boolean", default: false },
      "extract-model": { type: "string" },
      players: { type: "string" },
      "emit-fixtures": { type: "string" },
      "keep-frames": { type: "boolean", default: false },
      start: { type: "string" },
      end: { type: "string" },
      reference: { type: "string" },
      submit: { type: "boolean", default: false },
      "session-id": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const positional = positionals[0];
  const command = (positional ?? "extract") as Command;
  if (!COMMANDS.includes(command)) {
    console.error(`Unknown command: ${positional}`);
    printUsage();
    process.exit(1);
  }

  let profile: GameProfile;
  try {
    profile = resolveProfile(values.game as string);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // `bootstrap --from <image>` is a fast path that skips video entirely.
  const isBootstrapFromImage = command === "bootstrap" && Boolean(values.from);

  if (!isBootstrapFromImage && !values.url && !values.video) {
    console.error(
      "Must provide --url <youtube>, --video <path>, or (bootstrap only) --from <image>",
    );
    printUsage();
    process.exit(1);
  }

  // Per-game defaults; CLI flags override when provided. All numeric flags go
  // through parseFiniteNumber which fail-fast on NaN/out-of-range instead of
  // letting bad values silently propagate into ffmpeg or comparison operators.
  const fps =
    parseFiniteNumber({
      name: "fps",
      raw: values.fps,
      kind: "float",
      min: 0.01,
      max: 60,
    }) ?? profile.defaults.fps;
  const ocrMinKeywords =
    parseFiniteNumber({
      name: "ocr-min-keywords",
      raw: values["ocr-min-keywords"],
      kind: "int",
      min: 1,
    }) ?? profile.defaults.minKeywords;
  const dedupGap =
    parseFiniteNumber({
      name: "dedup-gap",
      raw: values["dedup-gap"],
      kind: "int",
      min: 0,
    }) ?? profile.defaults.dedupGap;
  const skipAheadSec =
    parseFiniteNumber({
      name: "skip-ahead-sec",
      raw: values["skip-ahead-sec"],
      kind: "float",
      min: 0,
    }) ?? profile.defaults.minMatchIntervalSec;
  const skipAheadFrames = values["no-skip-ahead"]
    ? 0
    : Math.max(0, Math.floor(skipAheadSec * fps));
  const phashThreshold = parseFiniteNumber({
    name: "phash-threshold",
    raw: values["phash-threshold"],
    kind: "int",
    min: 0,
    max: 64,
  })!;
  const quality = parseFiniteNumber({
    name: "quality",
    raw: values.quality,
    kind: "int",
    min: 144,
    max: 4320,
  })!;
  const sampleWidth = parseFiniteNumber({
    name: "sample-width",
    raw: values["sample-width"],
    kind: "int",
    min: 320,
    max: 4320,
  })!;
  const jpegQuality = parseFiniteNumber({
    name: "jpeg-quality",
    raw: values["jpeg-quality"],
    kind: "int",
    min: 1,
    max: 31,
  })!;
  const detectConcurrency =
    parseFiniteNumber({
      name: "detect-concurrency",
      raw: values["detect-concurrency"] ?? values["ocr-concurrency"],
      kind: "int",
      min: 1,
      max: 8,
    }) ?? DEFAULT_DETECT_CONCURRENCY;

  const detectorFlag = values.detector as string;
  if (!(DETECTORS as readonly string[]).includes(detectorFlag)) {
    console.error(
      `Invalid --detector: must be one of ${DETECTORS.join(", ")}, got "${detectorFlag}"`,
    );
    process.exit(1);
  }
  // auto keeps the free local OCR path wherever it's already set up.
  const detector: ResolvedConfig["detector"] =
    detectorFlag === "auto"
      ? isVisionOcrUsable(HARVESTER_ROOT)
        ? "ocr"
        : "ai"
      : (detectorFlag as ResolvedConfig["detector"]);
  const defaultModel = process.env.HARVEST_DETECT_MODEL || getVisionModelSpec();
  const detectModel =
    (values["detect-model"] as string | undefined) ?? defaultModel;

  const aiStrideSec = parseFiniteNumber({
    name: "ai-stride-sec",
    raw: values["ai-stride-sec"],
    kind: "float",
    min: 0,
  })!;
  const aiStrideFrames = Math.max(1, Math.round(aiStrideSec * fps));
  if (detector === "ai" && aiStrideFrames > dedupGap) {
    console.error(
      `Invalid --ai-stride-sec: ${aiStrideSec}s is ${aiStrideFrames} frames, more than ` +
        `--dedup-gap (${dedupGap}), so hits on one scoreboard would split into ` +
        `separate matches. Use at most ${dedupGap / fps}s or raise --dedup-gap.`,
    );
    process.exit(1);
  }
  const aiGrid = parseFiniteNumber({
    name: "ai-grid",
    raw: values["ai-grid"],
    kind: "int",
    min: 1,
    max: 4,
  })!;
  const aiMinConfidence = parseFiniteNumber({
    name: "ai-min-confidence",
    raw: values["ai-min-confidence"],
    kind: "float",
    min: 0,
    max: 1,
  })!;

  const draft = Boolean(values.draft) || values["emit-fixtures"] !== undefined;
  if (draft && profile.appGameId === undefined) {
    console.error(
      `--draft needs appGameId on the "${profile.id}" game profile (see games/README.md)`,
    );
    process.exit(1);
  }
  const players = ((values.players as string | undefined) ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const start = parseFiniteNumber({
    name: "start",
    raw: values.start,
    kind: "float",
    min: 0,
  });
  const end = parseFiniteNumber({
    name: "end",
    raw: values.end,
    kind: "float",
    min: 0,
  });
  const sessionId = parseFiniteNumber({
    name: "session-id",
    raw: values["session-id"],
    kind: "int",
    min: 1,
  });

  if (start !== undefined && end !== undefined && end <= start) {
    console.error(
      `Invalid --end: must be greater than --start (got start=${start}, end=${end})`,
    );
    process.exit(1);
  }

  const config: ResolvedConfig = {
    gameId: profile.id,
    out: path.resolve(values.out as string),
    fps,
    noPhash: Boolean(values["no-phash"]),
    phashThreshold,
    ocrMinKeywords,
    requireEndScreen: Boolean(values["require-end-screen"]),
    dedupGap,
    skipAheadFrames,
    quality,
    sampleWidth,
    jpegQuality,
    detectConcurrency,
    detector,
    detectModel: detector === "ai" ? detectModel : undefined,
    aiStrideFrames,
    aiGrid,
    aiMinConfidence,
    aiRefine: !values["no-refine"],
    hwaccel: values.hwaccel as string | undefined,
    draft,
    extractModel: draft
      ? ((values["extract-model"] as string | undefined) ?? detectModel)
      : undefined,
    players,
    emitFixtures: values["emit-fixtures"]
      ? path.resolve(values["emit-fixtures"] as string)
      : undefined,
    keepFrames: Boolean(values["keep-frames"]),
    start,
    end,
    submit: Boolean(values.submit),
    sessionId,
    referencePath: values.reference
      ? path.resolve(values.reference)
      : path.join(
          HARVESTER_ROOT,
          "reference",
          profile.id,
          profile.referenceFileName,
        ),
  };

  if (config.submit && config.sessionId === undefined) {
    console.error("--submit requires --session-id <id>");
    process.exit(1);
  }

  // Defensively strip zsh-style backslash escapes from URLs (e.g. \?, \=).
  const cleanUrl = values.url ? sanitizeUrl(values.url) : undefined;
  if (cleanUrl && cleanUrl !== values.url) {
    console.warn(`[input] stripped shell escapes from URL → ${cleanUrl}`);
  }

  return {
    command,
    profile,
    url: cleanUrl,
    video: values.video,
    from: values.from,
    config,
  };
}

/**
 * Validates an arbitrary image file and copies it into the reference path.
 * Used by `bootstrap --from <image>` to short-circuit the slow
 * detect-every-frame path when the caller already has a clean scoreboard
 * screenshot in hand.
 *
 * @param sourcePath - Image file the user wants to use as the reference.
 * @param referencePath - Absolute destination for the reference image.
 */
async function bootstrapFromImage(
  sourcePath: string,
  referencePath: string,
): Promise<void> {
  const absSource = path.resolve(sourcePath);
  if (!fs.existsSync(absSource)) {
    console.error(`[bootstrap] image not found: ${absSource}`);
    process.exit(1);
  }

  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(absSource).metadata();
    width = meta.width;
    height = meta.height;
  } catch (err) {
    console.error(
      `[bootstrap] not a valid image: ${absSource}`,
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }

  if (!width || !height) {
    console.error("[bootstrap] could not read image dimensions");
    process.exit(1);
  }
  if (width < 640 || height < 360) {
    console.error(
      `[bootstrap] image too small (${width}x${height}); need at least 640x360 for reliable pHash`,
    );
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(referencePath), { recursive: true });
  // Re-encode through sharp to normalize (strips EXIF, ensures PNG, consistent color profile).
  await sharp(absSource).png().toFile(referencePath);

  const hash = await loadReferenceHash(referencePath);
  console.log(
    `[bootstrap] reference saved → ${referencePath} (${width}x${height})`,
  );
  console.log(`[bootstrap] pHash=${hash?.toString(16) ?? "?"}`);
  console.log("[bootstrap] ready — `extract` will now use the fast path.");
}

/**
 * Prints CLI usage to stdout.
 */
function printUsage(): void {
  const games = listGameIds().join(", ");
  console.log(`
RDC Scoreboard Harvester

Usage:
  pnpm harvest -- extract   --game <id> --url <youtube>
  pnpm harvest -- extract   --game <id> --video ./game.mp4 --draft
  pnpm harvest -- bootstrap --game <id> --from ./shot.png   (fast)
  pnpm harvest -- bootstrap --game <id> --url <youtube>     (slow)

Commands:
  extract     (default) Harvest scoreboards (pHash pre-filter + detector).
  bootstrap   Set the pHash reference image for a given --game. Either supply
              your own screenshot via --from, or scan a video with --url/--video
              and we'll save the first detected scoreboard.

Game selection:
  --game <id>             Game profile (default: ${DEFAULT_GAME_ID})
                          Available: ${games}

Input source:
  --url <url>             YouTube URL
  --video <path>          Local video file
  --from <path>           Bootstrap-only: use an existing screenshot

Detector:
  --detector <kind>       auto (default) | ai | ocr. auto uses ocr on macOS
                          when the vision-ocr binary is built, else ai
  --detect-model <spec>   AI model, <provider>:<model> — e.g.
                          google:gemini-2.5-flash, local:qwen2.5vl:7b,
                          azure:<deployment>. Default: $HARVEST_DETECT_MODEL,
                          then $VISION_MODEL, then google:gemini-2.5-flash
  --detect-concurrency <n>  Classifier calls in flight (default: ${DEFAULT_DETECT_CONCURRENCY};
                          alias --ocr-concurrency)
  --ai-stride-sec <n>     AI coarse pass: classify one frame every n seconds
                          (default: ${DEFAULT_AI_STRIDE_SEC}; must be <= dedup-gap / fps)
  --ai-grid <n>           AI: frames per request = n×n contact sheet (default:
                          ${DEFAULT_AI_GRID}; try 2 for small local models, 1 to disable)
  --ai-min-confidence <n> AI: min confidence for a post-match verdict (default: ${DEFAULT_AI_MIN_CONFIDENCE})
  --no-refine             AI: skip re-checking every frame around coarse hits

Draft stats:
  --draft                 Run extraction on each saved match; writes match-NN.json
  --extract-model <spec>  Model for --draft (default: the detect model)
  --players <a,b,...>     Session roster for --draft (default: every RDC member)
  --emit-fixtures <dir>   Also write vision-eval fixtures (implies --draft), e.g.
                          scripts/vision-eval/fixtures

Detection tuning (defaults come from the active --game profile):
  --no-phash              Skip pHash pre-filter; classify every frame (use for
                          stream videos with face-cams/overlays)
  --phash-threshold <n>   Hamming distance cutoff 0-64 (default: 12)
  --ocr-min-keywords <n>  OCR: min game keywords to confirm a frame
  --require-end-screen    OCR: reject frames missing the game's end-screen
                          sentinel (e.g., WINNER for Rocket League)
  --dedup-gap <n>         Max frame gap inside one detected match
  --skip-ahead-sec <n>    After a confirmed run ends, skip ahead this many
                          seconds before resuming detection (game-default if omitted)
  --no-skip-ahead         Disable skip-ahead optimization entirely

I/O:
  --out <dir>             Output root (default: ./out → out/<game>/<video>/)
  --fps <n>               Frames per second to sample (game-default if omitted)
  --quality <px>          Max download height (default: 720)
  --sample-width <px>     Extracted frame width (default: ${DEFAULT_SAMPLE_WIDTH}; try 960)
  --jpeg-quality <n>      ffmpeg JPEG q value, lower is better (default: ${DEFAULT_JPEG_QUALITY}; try 5)
  --hwaccel <name>        ffmpeg -hwaccel for frame extraction (default:
                          videotoolbox on macOS, none elsewhere; e.g. cuda, vaapi)
  --start <sec>           Start time slice (debugging)
  --end <sec>             End time slice (debugging)
  --reference <path>      Override pHash reference image
  --keep-frames           Don't delete temp frames after run
  --submit                Pipe matches into analyzeScreenShot (stub)
  --session-id <id>       Required with --submit
  --help                  This message
`);
}

/**
 * Acquires the source video — either downloads it from YouTube or uses a
 * local file — and returns its absolute path plus duration in seconds.
 *
 * @param args.url - Optional YouTube URL.
 * @param args.video - Optional local video path.
 * @param args.config - Resolved pipeline config.
 * @param args.deps.ytDlpPath - yt-dlp binary path.
 * @param args.deps.ffprobePath - ffprobe binary path.
 * @returns The resolved video path, video ID slug, working directory, duration, and source URL (if any).
 */
async function acquireVideo(args: {
  url?: string;
  video?: string;
  config: ResolvedConfig;
  ytDlpPath: string;
  ffprobePath: string;
}): Promise<{
  filePath: string;
  videoId: string;
  workDir: string;
  durationSec: number;
  sourceUrl?: string;
}> {
  const { url, video, config, ytDlpPath, ffprobePath } = args;
  let filePath: string;
  let videoId: string;
  let durationSec: number;

  if (url) {
    // YouTube URLs use their 11-char watch ID; other URLs get a SHA-1 prefix
    // so two different non-YouTube URLs don't collide on the literal "video".
    videoId = urlToSlug(url);
    // Nested: out/<game-id>/<video-id>/ — keeps games separated when the same
    // video is processed with different profiles.
    const workDir = path.join(config.out, config.gameId, videoId);
    const dl = await downloadVideo({
      ytDlpPath,
      ffprobePath,
      url,
      outDir: workDir,
      maxHeight: config.quality,
    });
    filePath = dl.filePath;
    durationSec = dl.durationSec;
    return { filePath, videoId, workDir, durationSec, sourceUrl: url };
  }

  filePath = path.resolve(video!);
  if (!fs.existsSync(filePath)) {
    console.error(`Video file not found: ${filePath}`);
    process.exit(1);
  }
  videoId = path.basename(filePath, path.extname(filePath));
  const workDir = path.join(config.out, config.gameId, videoId);
  fs.mkdirSync(workDir, { recursive: true });
  durationSec = await probeDuration(ffprobePath, filePath);
  console.log(
    `[input] using local video, duration=${Math.round(durationSec)}s`,
  );
  return { filePath, videoId, workDir, durationSec };
}

/**
 * Decides whether to run the pHash filter and returns the surviving candidates.
 * In bootstrap mode we always skip pHash (we're trying to *find* the reference).
 * In extract mode we skip if no reference exists yet, so the detector sees
 * every frame.
 *
 * @param args.command - extract or bootstrap.
 * @param args.frames - All sampled frames.
 * @param args.config - Resolved config (used for referencePath and threshold).
 * @returns Candidate frames for the detector.
 */
async function runPhashStage(args: {
  command: Command;
  frames: FrameRecord[];
  config: ResolvedConfig;
}): Promise<FrameRecord[]> {
  const { command, frames, config } = args;

  if (config.noPhash) {
    console.log("[phash] --no-phash set → the detector will see every frame");
    return frames;
  }

  if (command === "bootstrap") {
    console.log(
      "[phash] bootstrap mode → skipping pHash, the detector will see every frame",
    );
    return frames;
  }

  if (!fs.existsSync(config.referencePath)) {
    console.warn(
      `[phash] no reference at ${config.referencePath} → the detector will see every frame (slow)`,
    );
    console.warn(
      `[phash] hint: run \`bootstrap --game ${config.gameId}\` once to generate the reference image`,
    );
    return frames;
  }

  const refHash = await loadReferenceHash(config.referencePath);
  if (!refHash) return frames;

  console.log(`[phash] reference loaded, threshold=${config.phashThreshold}`);
  const survivors = await filterByPHash({
    frames,
    refHash,
    threshold: config.phashThreshold,
  });
  console.log(`[phash] ${survivors.length}/${frames.length} survived filter`);

  if (survivors.length === 0 && frames.length > 0) {
    console.warn("");
    console.warn("[phash] WARNING: 0 frames matched the reference image.");
    console.warn(
      "[phash] This usually means the reference's visual context differs from the video",
    );
    console.warn(
      "[phash] (e.g., a clean game screenshot vs. a YouTube stream with face-cams/overlays).",
    );
    console.warn("");
    console.warn("[phash] Recommended fix — re-run without the pHash filter:");
    console.warn(
      `[phash]   npm run harvest -- extract --game ${config.gameId} --video <path-or-url> --no-phash`,
    );
    console.warn("");
    console.warn("[phash] Classifying every frame is slower but reliable.");
    console.warn("");
  }
  return survivors;
}

/**
 * Cleans up the temp frames directory if --keep-frames was not specified.
 *
 * @param workDir - The video's working directory.
 * @param keepFrames - Whether to retain frames/.
 */
function cleanup(workDir: string, keepFrames: boolean): void {
  if (keepFrames) return;
  const framesDir = path.join(workDir, "frames");
  if (fs.existsSync(framesDir)) {
    fs.rmSync(framesDir, { recursive: true, force: true });
    console.log(`[cleanup] removed ${framesDir}`);
  }
}

/**
 * Pipeline entry point.
 */
async function main(): Promise<void> {
  const startTime = Date.now();
  const { command, profile, url, video, from, config } = parseInputs();

  console.log(
    `[game] ${profile.displayName} (${profile.id})` +
      ` detector=${config.detector}` +
      (config.detector === "ai"
        ? ` model=${config.detectModel} grid=${config.aiGrid}x${config.aiGrid}`
        : ` keywords=${profile.keywords.length}` +
          (profile.endScreenSentinel
            ? ` sentinel=${profile.endScreenSentinel}`
            : "")),
  );
  if (config.skipAheadFrames > 0) {
    console.log(
      `[game] skip-ahead enabled: ${config.skipAheadFrames} frames ` +
        `(~${Math.round(config.skipAheadFrames / config.fps)}s) after each match`,
    );
  } else {
    console.log(`[game] skip-ahead disabled (--no-skip-ahead)`);
  }

  // Fast path: bootstrap from an existing screenshot. Skips deps + video pipeline
  // since we don't need yt-dlp, ffmpeg, or even vision-ocr for this — sharp alone handles it.
  if (command === "bootstrap" && from) {
    await bootstrapFromImage(from, config.referencePath);
    console.log(`[done] runtime=${Date.now() - startTime}ms`);
    return;
  }

  const deps = checkDeps(HARVESTER_ROOT, {
    requireYtDlp: Boolean(url),
    requireVisionOcr: config.detector === "ocr",
  });
  if (!deps.ok) {
    console.error("Missing dependencies:");
    for (const e of deps.errors) console.error("  - " + e);
    process.exit(1);
  }

  const { filePath, videoId, workDir, durationSec, sourceUrl } =
    await acquireVideo({
      url,
      video,
      config,
      ytDlpPath: deps.ytDlpPath,
      ffprobePath: deps.ffprobePath,
    });

  const framesDir = path.join(workDir, "frames");
  const frames = await sampleFrames({
    ffmpegPath: deps.ffmpegPath,
    videoPath: filePath,
    framesDir,
    fps: config.fps,
    sampleWidth: config.sampleWidth,
    jpegQuality: config.jpegQuality,
    hwaccel: config.hwaccel,
    start: config.start,
    end: config.end,
    durationSec,
  });
  console.log(`[sample] ${frames.length} frames ready`);

  const candidates = await runPhashStage({ command, frames, config });

  const classifier: FrameClassifier =
    config.detector === "ocr"
      ? createOcrClassifier({
          visionOcrPath: deps.visionOcrPath,
          keywords: profile.keywords,
          minKeywords: config.ocrMinKeywords,
          endScreenSentinel: profile.endScreenSentinel,
          requireEndScreen: config.requireEndScreen,
          concurrency: config.detectConcurrency,
        })
      : createAiClassifier({
          profile,
          modelSpec: config.detectModel!,
          grid: config.aiGrid,
          minConfidence: config.aiMinConfidence,
          cachePath: path.join(workDir, "detections.jsonl"),
          debugDir: config.keepFrames
            ? path.join(workDir, "sheets")
            : undefined,
        });

  let confirmed: DetectionRecord[];
  try {
    confirmed = await runDetection({
      classifier,
      candidates,
      // Only stride over the full sample; pHash survivors are already sparse.
      coarse: config.detector === "ai" && candidates.length === frames.length,
      config,
    });
  } finally {
    await classifier.close();
  }
  console.log(
    `[${config.detector}] ${confirmed.length} confirmed scoreboard frames` +
      (config.detector === "ocr" && config.requireEndScreen
        ? " (require-end-screen=on)"
        : ""),
  );

  if (command === "bootstrap") {
    if (confirmed.length === 0) {
      console.error("[bootstrap] no scoreboards found, cannot save reference");
      process.exit(2);
    }
    fs.mkdirSync(path.dirname(config.referencePath), { recursive: true });
    fs.copyFileSync(confirmed[0].filePath, config.referencePath);
    console.log(`[bootstrap] saved reference → ${config.referencePath}`);
    cleanup(workDir, config.keepFrames);
    console.log(`[done] runtime=${Date.now() - startTime}ms`);
    return;
  }

  let matches = await dedupAndSave({
    confirmed,
    outDir: workDir,
    gapTolerance: config.dedupGap,
    detection: { detector: config.detector, model: config.detectModel },
  });
  console.log(`[dedup] saved ${matches.length} match screenshot(s)`);

  if (config.draft && matches.length > 0) {
    const draftModule = await loadDraftModule();
    if (draftModule)
      matches = await draftModule.draftMatches({
        matches,
        workDir,
        appGameId: profile.appGameId!,
        modelSpec: config.extractModel!,
        players: config.players,
        emitFixtures: config.emitFixtures,
        source: { videoId, url: sourceUrl, filePath },
      });
  }

  if (config.submit && config.sessionId !== undefined) {
    matches = await submitMatches(matches, config.sessionId);
  }

  const manifest: Manifest = {
    game: profile.id,
    source: {
      url: sourceUrl,
      filePath,
      durationSec,
      fps: config.fps,
    },
    config: { ...config },
    runtimeMs: Date.now() - startTime,
    matches,
  };
  const manifestPath = path.join(workDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[manifest] ${manifestPath}`);

  cleanup(workDir, config.keepFrames);
  console.log(`[done] runtime=${manifest.runtimeMs}ms output=${workDir}`);
}

/**
 * Lazily loads the --draft stage, which pulls in the app's constants and,
 * through them, the Prisma typed-SQL client. If it can't load, warn and
 * return undefined so the detection results still get written.
 */
async function loadDraftModule(): Promise<
  typeof import("./pipeline/draft") | undefined
> {
  try {
    return await import("./pipeline/draft");
  } catch (err) {
    console.warn(
      `[draft] skipped: couldn't load the app's vision pipeline ` +
        `(${err instanceof Error ? err.message : err}).`,
    );
    console.warn(
      "[draft] --draft loads the app's extraction code, which needs the Prisma " +
        "client generated with typed SQL (`pnpm prisma generate --sql`, with a " +
        "reachable DATABASE_URL) and the app's .env. Fix that and re-run — " +
        "detection is cached, so only extraction will call the model.",
    );
    return undefined;
  }
}

/**
 * Runs the detector over the candidates. For the AI detector on the full
 * sample, that's a coarse pass every `aiStrideFrames` frames (with
 * skip-ahead), then — unless --no-refine — a pass over the skipped frames
 * around each coarse run, so dedup's "sharpest frame from the middle of the
 * run" sees the whole run rather than every Nth frame of it.
 *
 * @returns Confirmed frames, ascending frameId.
 */
async function runDetection(args: {
  classifier: FrameClassifier;
  candidates: FrameRecord[];
  coarse: boolean;
  config: ResolvedConfig;
}): Promise<DetectionRecord[]> {
  const { classifier, candidates, config } = args;
  const label = config.detector;
  const stride = args.coarse ? config.aiStrideFrames : 1;
  const pass = (
    frames: FrameRecord[],
    skipAheadFrames: number,
    passLabel: string,
  ) =>
    detectFrames(frames, classifier, {
      dedupGap: config.dedupGap,
      skipAheadFrames,
      concurrency: config.detectConcurrency,
      label: passLabel,
    });

  if (stride <= 1) return pass(candidates, config.skipAheadFrames, label);

  const coarseFrames = candidates.filter((f) => (f.frameId - 1) % stride === 0);
  console.log(
    `[${label}] coarse pass: ${coarseFrames.length}/${candidates.length} frames (every ${stride})`,
  );
  const coarseHits = await pass(coarseFrames, config.skipAheadFrames, label);
  if (!config.aiRefine || coarseHits.length === 0) return coarseHits;

  const refineFrames = selectRefineFrames(
    candidates,
    clusterConsecutive(coarseHits, config.dedupGap),
    stride,
    new Set(coarseFrames.map((f) => f.frameId)),
  );
  console.log(
    `[${label}] refine pass: ${refineFrames.length} frames around coarse hits`,
  );
  const refineHits = await pass(refineFrames, 0, `${label}:refine`);

  return [...coarseHits, ...refineHits].sort((a, b) => a.frameId - b.frameId);
}

main().catch((err) => {
  console.error("[fatal]", err instanceof Error ? err.stack : err);
  process.exit(1);
});
