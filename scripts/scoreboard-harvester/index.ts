#!/usr/bin/env tsx
/**
 * RDC Scoreboard Harvester.
 *
 * Downloads (or accepts) a video, extracts end-of-match scoreboard
 * screenshots, and writes one PNG per detected match. Game-agnostic — the
 * actual scoreboard recognition is driven by a per-game profile in games/.
 * See README.md for full docs.
 *
 *   npx tsx scripts/scoreboard-harvester extract  --game rocket-league --url <youtube>
 *   npx tsx scripts/scoreboard-harvester bootstrap --game rocket-league --from ./shot.png
 */
import { parseArgs } from "util";
import path from "path";
import fs from "fs";
import sharp from "sharp";

import { checkDeps } from "./pipeline/deps";
import { downloadVideo, probeDuration } from "./pipeline/download";
import { sampleFrames } from "./pipeline/sample";
import { filterByPHash, loadReferenceHash } from "./pipeline/phash";
import { ocrFrames } from "./pipeline/ocr";
import { dedupAndSave } from "./pipeline/dedup";
import { submitMatches } from "./pipeline/submit";
import { parseFiniteNumber, sanitizeUrl, urlToSlug } from "./utils";
import { FrameRecord, Manifest, ResolvedConfig } from "./types";
import {
  DEFAULT_GAME_ID,
  listGameIds,
  resolveProfile,
} from "./games/registry";
import type { GameProfile } from "./games/types";

const HARVESTER_ROOT = __dirname;
const COMMANDS = ["extract", "bootstrap"] as const;
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
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
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
 * Used by `bootstrap --from <image>` to short-circuit the slow OCR-every-frame
 * path when the caller already has a clean scoreboard screenshot in hand.
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
  npx tsx scripts/scoreboard-harvester extract   --game <id> --url <youtube>
  npx tsx scripts/scoreboard-harvester extract   --game <id> --video ./game.mp4
  npx tsx scripts/scoreboard-harvester bootstrap --game <id> --from ./shot.png   (fast)
  npx tsx scripts/scoreboard-harvester bootstrap --game <id> --url <youtube>     (slow)

Commands:
  extract     (default) Harvest scoreboards using pHash + OCR.
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

Detection tuning (defaults come from the active --game profile):
  --no-phash              Skip pHash pre-filter; OCR every frame (use for
                          stream videos with face-cams/overlays)
  --phash-threshold <n>   Hamming distance cutoff 0-64 (default: 12)
  --ocr-min-keywords <n>  Min game keywords to confirm a frame
  --require-end-screen    Reject frames missing the game's end-screen sentinel
                          (e.g., WINNER for Rocket League)
  --dedup-gap <n>         Max frame gap inside one detected match
  --skip-ahead-sec <n>    After a confirmed run ends, skip ahead this many
                          seconds before resuming OCR (game-default if omitted)
  --no-skip-ahead         Disable skip-ahead optimization entirely

I/O:
  --out <dir>             Output root (default: ./out → out/<game>/<video>/)
  --fps <n>               Frames per second to sample (game-default if omitted)
  --quality <px>          Max download height (default: 720)
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
  console.log(`[input] using local video, duration=${Math.round(durationSec)}s`);
  return { filePath, videoId, workDir, durationSec };
}

/**
 * Decides whether to run the pHash filter and returns the surviving candidates.
 * In bootstrap mode we always skip pHash (we're trying to *find* the reference).
 * In extract mode we skip if no reference exists yet, falling back to OCR-only.
 *
 * @param args.command - extract or bootstrap.
 * @param args.frames - All sampled frames.
 * @param args.config - Resolved config (used for referencePath and threshold).
 * @returns Candidate frames for OCR.
 */
async function runPhashStage(args: {
  command: Command;
  frames: FrameRecord[];
  config: ResolvedConfig;
}): Promise<FrameRecord[]> {
  const { command, frames, config } = args;

  if (config.noPhash) {
    console.log("[phash] --no-phash set → OCR will see every frame");
    return frames;
  }

  if (command === "bootstrap") {
    console.log(
      "[phash] bootstrap mode → skipping pHash, OCR will see every frame",
    );
    return frames;
  }

  if (!fs.existsSync(config.referencePath)) {
    console.warn(
      `[phash] no reference at ${config.referencePath} → falling back to OCR-only (slow)`,
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
    console.warn(
      "[phash] OCR-only is slower (~10–15 min for a 2-hour video at 1 fps) but reliable.",
    );
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
      ` keywords=${profile.keywords.length}` +
      (profile.endScreenSentinel
        ? ` sentinel=${profile.endScreenSentinel}`
        : ""),
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

  const deps = checkDeps(HARVESTER_ROOT, Boolean(url));
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
    start: config.start,
    end: config.end,
    durationSec,
  });
  console.log(`[sample] ${frames.length} frames ready`);

  const candidates = await runPhashStage({ command, frames, config });

  const confirmed = await ocrFrames(candidates, {
    visionOcrPath: deps.visionOcrPath,
    keywords: profile.keywords,
    minKeywords: config.ocrMinKeywords,
    endScreenSentinel: profile.endScreenSentinel,
    requireEndScreen: config.requireEndScreen,
    dedupGap: config.dedupGap,
    skipAheadFrames: config.skipAheadFrames,
  });
  console.log(
    `[ocr] ${confirmed.length} confirmed scoreboard frames` +
      (config.requireEndScreen ? " (require-end-screen=on)" : ""),
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
  });
  console.log(`[dedup] saved ${matches.length} match screenshot(s)`);

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
  // Reference videoId in case future telemetry wants it (unused right now).
  void videoId;
}

main().catch((err) => {
  console.error("[fatal]", err instanceof Error ? err.stack : err);
  process.exit(1);
});
