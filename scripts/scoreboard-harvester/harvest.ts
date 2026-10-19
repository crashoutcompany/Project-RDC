import fs from "fs";
import path from "path";
import type { Player } from "@/generated/prisma/client";
import { DepCheckResult } from "./pipeline/deps";
import { downloadVideo, probeDuration } from "./pipeline/download";
import { sampleFrames } from "./pipeline/sample";
import { dedupAndSave } from "./pipeline/dedup";
import { analyzeJobs } from "./pipeline/analyze";
import { findScoreboards } from "./pipeline/finders";
import { locatorFor } from "./pipeline/locators";
import { urlToSlug } from "./utils";
import { Manifest, ResolvedConfig } from "./types";
import type { GameProfile } from "./games/types";

export interface HarvestResult {
  workDir: string;
  videoId: string;
  manifest: Manifest;
}

/**
 * Acquires the source video — either downloads it from YouTube or uses a
 * local file — and returns its absolute path plus duration in seconds.
 */
async function acquireVideo(args: {
  url?: string;
  video?: string;
  config: ResolvedConfig;
  deps: DepCheckResult;
}): Promise<{
  filePath: string;
  videoId: string;
  workDir: string;
  durationSec: number;
  downloaded: boolean;
}> {
  const { url, video, config, deps } = args;

  if (url) {
    // YouTube URLs use their 11-char watch ID; other URLs get a SHA-1 prefix
    // so two different non-YouTube URLs don't collide on the literal "video".
    const videoId = urlToSlug(url);
    // Nested: out/<game-id>/<video-id>/ — keeps games separated when the same
    // video is processed with different profiles.
    const workDir = path.join(config.out, config.gameId, videoId);
    const dl = await downloadVideo({
      ytDlpPath: deps.ytDlpPath,
      ytDlpArgs: deps.ytDlpArgs,
      ffprobePath: deps.ffprobePath,
      url,
      outDir: workDir,
      maxHeight: config.quality,
    });
    return { ...dl, videoId, workDir, downloaded: true };
  }

  const filePath = path.resolve(video!);
  if (!fs.existsSync(filePath))
    throw new Error(`Video file not found: ${filePath}`);
  const videoId = path.basename(filePath, path.extname(filePath));
  const workDir = path.join(config.out, config.gameId, videoId);
  fs.mkdirSync(workDir, { recursive: true });
  const durationSec = await probeDuration(deps.ffprobePath, filePath);
  console.log(
    `[input] using local video, duration=${Math.round(durationSec)}s`,
  );
  return { filePath, videoId, workDir, durationSec, downloaded: false };
}

/**
 * Runs one video through the pipeline: download → sample → find
 * scoreboards (Decisions or local OCR) → dedup → read stats (Gemini or Azure)
 * → manifest.json. Every stage is resumable from disk, so a crashed weekly
 * run picks up where it stopped.
 *
 * `deferAnalysis` stops before reading stats so a bulk run can read every
 * video's scoreboards in one batch (see `analyzeJobs`).
 */
export async function harvestVideo(args: {
  profile: GameProfile;
  config: ResolvedConfig;
  deps: DepCheckResult;
  url?: string;
  video?: string;
  /** Required when `config.analyze` is on (see pipeline/analyze.ts). */
  players?: Player[];
  deferAnalysis?: boolean;
}): Promise<HarvestResult> {
  const { profile, config, deps, url, video } = args;
  const startTime = Date.now();
  if (!deps.ocrEngine && config.finder !== "ai")
    throw new Error("No OCR engine available");

  const { filePath, videoId, workDir, durationSec, downloaded } =
    await acquireVideo({ url, video, config, deps });

  const framesDir = path.join(workDir, "frames");
  const locator = locatorFor(profile.id);
  let confirmed;
  let finderId: string;
  let finderFallback: string | null;
  if (locator) {
    if (!args.players)
      throw new Error(`${profile.displayName} needs the player roster to read results`);
    confirmed = await locator.locate({
      videoPath: filePath,
      workDir,
      ffmpegPath: deps.ffmpegPath,
      durationSec,
      players: args.players,
      gameId: profile.gameId,
      concurrency: config.decisionsConcurrency,
    });
    finderId = profile.id;
    finderFallback = null;
  } else {
    const frames = await sampleFrames({
      ffmpegPath: deps.ffmpegPath,
      videoPath: filePath,
      framesDir,
      fps: config.fps,
      mode: config.sampling,
      sampleWidth: config.sampleWidth,
      jpegQuality: config.jpegQuality,
      hwaccel: config.hwaccel,
      start: config.start,
      end: config.end,
      durationSec,
    });
    console.log(`[sample] ${frames.length} frames ready`);

    const found = await findScoreboards({
      finder: config.finder,
      frames,
      profile,
      config,
      deps,
      workDir,
      skipAheadSec: config.skipAheadSec,
    });
    confirmed = found.confirmed;
    finderId = found.finder;
    finderFallback = found.fallback;
    console.log(
      `[find] ${confirmed.length} scoreboard frames via ${found.finder}` +
        (config.requireEndScreen && found.finder !== "decisions" ? " (require-end-screen=on)" : ""),
    );
  }

  let matches = await dedupAndSave({
    confirmed,
    outDir: workDir,
    gapSec: config.dedupGapSec,
  });
  console.log(`[dedup] saved ${matches.length} match screenshot(s)`);

  // A locator already read these frames. Only unread matches go to the readers.
  if (config.analyze && !args.deferAnalysis && matches.some((match) => match.analysis === null)) {
    [matches] = await analyzeJobs({
      jobs: [{ matches, workDir, gameId: profile.gameId }],
      players: args.players ?? [],
      reader: config.reader,
      batch: config.batch,
    });
  }
  if (locator) matches = locator.refine(matches, args.players ?? []);

  const manifest: Manifest = {
    game: profile.id,
    source: {
      url,
      filePath,
      durationSec,
      fps: config.fps,
    },
    config: { ...config },
    finder: { id: finderId, fallback: finderFallback },
    runtimeMs: Date.now() - startTime,
    matches,
  };
  const manifestPath = path.join(workDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[manifest] ${manifestPath}`);

  if (!config.keepFrames && fs.existsSync(framesDir)) {
    fs.rmSync(framesDir, { recursive: true, force: true });
    console.log(`[cleanup] removed ${framesDir}`);
  }
  // Only delete what we downloaded — never a user's local --video file.
  if (downloaded && !config.keepVideo && fs.existsSync(filePath)) {
    fs.rmSync(filePath);
    console.log(`[cleanup] removed ${filePath}`);
  }

  console.log(`[done] runtime=${manifest.runtimeMs}ms output=${workDir}`);
  return { workDir, videoId, manifest };
}
