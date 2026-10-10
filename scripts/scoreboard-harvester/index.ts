#!/usr/bin/env tsx
/**
 * RDC Scoreboard Harvester.
 *
 * Downloads (or accepts) a video, extracts end-of-match scoreboard
 * screenshots, and optionally reads their stats with the game's Azure model.
 * Game-agnostic — the actual scoreboard recognition is driven by a per-game
 * profile in games/. See README.md for full docs.
 *
 *   pnpm harvest -- extract   --game rocket-league --url <youtube> [--analyze]
 *   pnpm harvest -- bootstrap --game rocket-league --from ./shot.png
 *   pnpm harvest -- weekly    [--write] [--limit 4]
 */
import { parseArgs } from "util";
import path from "path";
import fs from "fs";
import sharp from "sharp";

import { checkDeps } from "./pipeline/deps";
import { loadReferenceHash } from "./pipeline/phash";
import { harvestVideo } from "./harvest";
import {
  extractYoutubeId,
  parseFiniteNumber,
  sanitizeUrl,
} from "./utils";
import { ResolvedConfig } from "./types";
import {
  DEFAULT_GAME_ID,
  GAME_PROFILES,
  listGameIds,
  resolveProfile,
} from "./games/registry";
import type { GameProfile } from "./games/types";

// Not __dirname: the generated Prisma client overwrites the global one.
const HARVESTER_ROOT = import.meta.dirname;
const COMMANDS = ["extract", "bootstrap", "weekly"] as const;
const DEFAULT_SAMPLE_WIDTH = 1280;
const DEFAULT_JPEG_QUALITY = 3;
const DEFAULT_OCR_CONCURRENCY = 2;
const DEFAULT_WEEKLY_LIMIT = 4;
type Command = (typeof COMMANDS)[number];

const OPTIONS = {
  game: { type: "string" },
  url: { type: "string" },
  video: { type: "string" },
  videos: { type: "string" },
  from: { type: "string" },
  out: { type: "string", default: "./out" },
  fps: { type: "string" },
  sampling: { type: "string" },
  "ocr-engine": { type: "string", default: "auto" },
  "no-phash": { type: "boolean", default: false },
  "phash-threshold": { type: "string", default: "12" },
  "ocr-min-keywords": { type: "string" },
  "require-end-screen": { type: "boolean" },
  "no-require-end-screen": { type: "boolean", default: false },
  "dedup-gap": { type: "string" },
  "skip-ahead-sec": { type: "string" },
  "no-skip-ahead": { type: "boolean", default: false },
  quality: { type: "string", default: "720" },
  "sample-width": { type: "string", default: String(DEFAULT_SAMPLE_WIDTH) },
  "jpeg-quality": { type: "string", default: String(DEFAULT_JPEG_QUALITY) },
  "ocr-concurrency": {
    type: "string",
    default: String(DEFAULT_OCR_CONCURRENCY),
  },
  "keep-frames": { type: "boolean", default: false },
  "keep-video": { type: "boolean", default: false },
  start: { type: "string" },
  end: { type: "string" },
  reference: { type: "string" },
  analyze: { type: "boolean", default: false },
  write: { type: "boolean", default: false },
  limit: { type: "string", default: String(DEFAULT_WEEKLY_LIMIT) },
  retry: { type: "boolean", default: false },
  help: { type: "boolean", default: false },
} as const;

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>["values"];

/**
 * Resolves CLI flags against a game profile's defaults. All numeric flags go
 * through parseFiniteNumber, which fails fast on NaN/out-of-range instead of
 * letting bad values silently propagate into ffmpeg or comparison operators.
 */
function resolveConfig(
  profile: GameProfile,
  values: Values,
  command: Command,
): ResolvedConfig {
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
  if (start !== undefined && end !== undefined && end <= start) {
    console.error(
      `Invalid --end: must be greater than --start (got start=${start}, end=${end})`,
    );
    process.exit(1);
  }

  const sampling = values.sampling ?? profile.defaults.sampling ?? "fps";
  if (sampling !== "fps" && sampling !== "keyframes") {
    console.error(`Invalid --sampling: expected fps or keyframes, got "${sampling}"`);
    process.exit(1);
  }
  const ocrEngine = values["ocr-engine"] ?? "auto";
  if (ocrEngine !== "auto" && ocrEngine !== "vision" && ocrEngine !== "rapidocr") {
    console.error(`Invalid --ocr-engine: expected auto, vision, or rapidocr`);
    process.exit(1);
  }

  return {
    gameId: profile.id,
    out: path.resolve(values.out as string),
    fps,
    sampling,
    ocrEngine,
    // RDC uploads are stream VODs whose overlays defeat whole-frame pHash.
    noPhash: command === "weekly" || Boolean(values["no-phash"]),
    phashThreshold: parseFiniteNumber({
      name: "phash-threshold",
      raw: values["phash-threshold"],
      kind: "int",
      min: 0,
      max: 64,
    })!,
    ocrMinKeywords,
    requireEndScreen: values["no-require-end-screen"]
      ? false
      : (values["require-end-screen"] ??
        profile.defaults.requireEndScreen ??
        false),
    // --dedup-gap is in frames at the sample rate; the pipeline works in seconds.
    dedupGapSec: dedupGap / fps,
    skipAheadSec: values["no-skip-ahead"] ? 0 : skipAheadSec,
    quality: parseFiniteNumber({
      name: "quality",
      raw: values.quality,
      kind: "int",
      min: 144,
      max: 4320,
    })!,
    sampleWidth: parseFiniteNumber({
      name: "sample-width",
      raw: values["sample-width"],
      kind: "int",
      min: 320,
      max: 4320,
    })!,
    jpegQuality: parseFiniteNumber({
      name: "jpeg-quality",
      raw: values["jpeg-quality"],
      kind: "int",
      min: 1,
      max: 31,
    })!,
    ocrConcurrency: parseFiniteNumber({
      name: "ocr-concurrency",
      raw: values["ocr-concurrency"],
      kind: "int",
      min: 1,
      max: 8,
    })!,
    keepFrames: Boolean(values["keep-frames"]),
    // `extract` keeps video.mp4 for cheap reruns; the weekly job deletes it
    // (a 2h 720p VOD is ~2 GB) unless asked not to.
    keepVideo: command === "weekly" ? Boolean(values["keep-video"]) : true,
    start,
    end,
    analyze: command === "weekly" || Boolean(values.analyze),
    referencePath: values.reference
      ? path.resolve(values.reference)
      : path.join(
          HARVESTER_ROOT,
          "reference",
          profile.id,
          profile.referenceFileName,
        ),
  };
}

/**
 * Validates an arbitrary image file and copies it into the reference path.
 * Used by `bootstrap --from <image>` to short-circuit the slow OCR-every-frame
 * path when the caller already has a clean scoreboard screenshot in hand.
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

function printUsage(): void {
  const games = listGameIds().join(", ");
  console.log(`
RDC Scoreboard Harvester

Usage:
  pnpm harvest -- extract   --game <id> --url <youtube> [--analyze]
  pnpm harvest -- extract   --game <id> --video ./game.mp4
  pnpm harvest -- bootstrap --game <id> --from ./shot.png   (fast)
  pnpm harvest -- bootstrap --game <id> --url <youtube>     (slow)
  pnpm harvest -- weekly    [--write] [--limit ${DEFAULT_WEEKLY_LIMIT}] [--videos <id,id> --game <id>]

Commands:
  extract     (default) Harvest scoreboard screenshots from one video.
  bootstrap   Set the pHash reference image for a given --game.
  weekly      Find uploads missing from the database (Google Sheet "Truth"),
              harvest + analyze them, and save unapproved draft sessions.

Game selection:
  --game <id>             Game profile (default: ${DEFAULT_GAME_ID})
                          Available: ${games}

Input source:
  --url <url>             YouTube URL
  --video <path>          Local video file
  --from <path>           Bootstrap-only: use an existing screenshot

Weekly:
  --write                 Save drafts to the database (otherwise dry run:
                          draft.json files only)
  --limit <n>             Max videos per run (default: ${DEFAULT_WEEKLY_LIMIT})
  --videos <id,id>        Process these YouTube IDs instead of the sheet
                          (uses --game)
  --retry                 Retry videos that failed 3x or had no scoreboards
  --keep-video            Don't delete downloaded videos after success

Detection tuning (defaults come from the active --game profile):
  --sampling <mode>       fps | keyframes (decode I-frames only; much faster)
  --ocr-engine <name>     auto | vision | rapidocr (auto = Vision on macOS)
  --no-phash              Skip pHash pre-filter; OCR every frame
  --phash-threshold <n>   Hamming distance cutoff 0-64 (default: 12)
  --ocr-min-keywords <n>  Min game keywords to confirm a frame
  --require-end-screen    Reject frames missing the game's end-screen sentinel
  --no-require-end-screen Turn that off for games that default it on
  --dedup-gap <n>         Max gap inside one detected match, in frames at --fps
  --skip-ahead-sec <n>    After a confirmed run ends, skip ahead this many
                          seconds before resuming OCR (game-default if omitted)
  --no-skip-ahead         Disable skip-ahead optimization entirely

I/O:
  --out <dir>             Output root (default: ./out → out/<game>/<video>/)
  --fps <n>               Frames per second to sample (game-default if omitted)
  --quality <px>          Max download height (default: 720)
  --sample-width <px>     Extracted frame width (default: ${DEFAULT_SAMPLE_WIDTH}; try 960)
  --jpeg-quality <n>      ffmpeg JPEG q value, lower is better (default: ${DEFAULT_JPEG_QUALITY}; try 5)
  --ocr-concurrency <n>   Persistent OCR workers (default: ${DEFAULT_OCR_CONCURRENCY})
  --start <sec>           Start time slice (debugging)
  --end <sec>             End time slice (debugging)
  --reference <path>      Override pHash reference image
  --keep-frames           Don't delete temp frames after run
  --analyze               Read each scoreboard with the game's Azure model
  --help                  This message
`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: OPTIONS,
  });

  if (values.help) {
    printUsage();
    return;
  }

  const command = (positionals[0] ?? "extract") as Command;
  if (!COMMANDS.includes(command)) {
    console.error(`Unknown command: ${positionals[0]}`);
    printUsage();
    process.exit(1);
  }

  let profile: GameProfile;
  try {
    profile = resolveProfile(values.game ?? DEFAULT_GAME_ID);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (command === "weekly") {
    const deps = checkDeps(
      HARVESTER_ROOT,
      true,
      resolveConfig(profile, values, command).ocrEngine,
    );
    exitOnMissingDeps(deps.errors);
    const limit = parseFiniteNumber({
      name: "limit",
      raw: values.limit,
      kind: "int",
      min: 1,
    })!;
    const videos = values.videos
      ?.split(",")
      .map((v) => extractYoutubeId(v) ?? v.trim())
      .filter(Boolean)
      .map((videoId) => ({ videoId, profile }));
    const { runWeekly } = await import("./weekly/run");
    process.exitCode = await runWeekly({
      profiles: GAME_PROFILES,
      configFor: (p) => resolveConfig(p, values, command),
      deps,
      out: path.resolve(values.out as string),
      write: Boolean(values.write),
      limit,
      videos,
      retry: Boolean(values.retry),
    });
    return;
  }

  const config = resolveConfig(profile, values, command);
  console.log(
    `[game] ${profile.displayName} (${profile.id})` +
      ` keywords=${profile.keywords.length} sampling=${config.sampling}` +
      (config.requireEndScreen ? " require-end-screen" : ""),
  );

  // Fast path: bootstrap from an existing screenshot. Skips deps + video
  // pipeline — sharp alone handles it.
  if (command === "bootstrap" && values.from) {
    await bootstrapFromImage(values.from, config.referencePath);
    return;
  }

  if (!values.url && !values.video) {
    console.error(
      "Must provide --url <youtube>, --video <path>, or (bootstrap only) --from <image>",
    );
    printUsage();
    process.exit(1);
  }

  // Defensively strip zsh-style backslash escapes from URLs (e.g. \?, \=).
  const url = values.url ? sanitizeUrl(values.url) : undefined;
  if (url && url !== values.url)
    console.warn(`[input] stripped shell escapes from URL → ${url}`);

  const deps = checkDeps(HARVESTER_ROOT, Boolean(url), config.ocrEngine);
  exitOnMissingDeps(deps.errors);

  let players;
  if (config.analyze) {
    const { default: prisma } = await import("prisma/db");
    players = await prisma.player.findMany();
    await prisma.$disconnect();
  }

  await harvestVideo({
    mode: command,
    profile,
    config,
    deps,
    url,
    video: values.video,
    players,
  });
}

function exitOnMissingDeps(errors: string[]): void {
  if (errors.length === 0) return;
  console.error("Missing dependencies:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

main().catch((err) => {
  console.error("[fatal]", err instanceof Error ? err.stack : err);
  process.exit(1);
});
