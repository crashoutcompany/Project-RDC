import fs from "fs";
import path from "path";
import type { Player } from "@/generated/prisma/client";
import { DepCheckResult } from "./pipeline/deps";
import { downloadVideo, probeDuration } from "./pipeline/download";
import { sampleFrames } from "./pipeline/sample";
import { filterByPHash, loadReferenceHash } from "./pipeline/phash";
import { ocrFrames } from "./pipeline/ocr";
import { dedupAndSave } from "./pipeline/dedup";
import { analyzeMatches } from "./pipeline/analyze";
import { urlToSlug } from "./utils";
import { FrameRecord, Manifest, ResolvedConfig } from "./types";
import type { GameProfile } from "./games/types";

export type HarvestMode = "extract" | "bootstrap";

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
 * Decides whether to run the pHash filter and returns the surviving candidates.
 * In bootstrap mode we always skip pHash (we're trying to *find* the reference).
 * In extract mode we skip if no reference exists yet, falling back to OCR-only.
 */
async function runPhashStage(args: {
  mode: HarvestMode;
  frames: FrameRecord[];
  config: ResolvedConfig;
}): Promise<FrameRecord[]> {
  const { mode, frames, config } = args;

  if (config.noPhash) {
    console.log("[phash] --no-phash set → OCR will see every frame");
    return frames;
  }

  if (mode === "bootstrap") {
    console.log(
      "[phash] bootstrap mode → skipping pHash, OCR will see every frame",
    );
    return frames;
  }

  if (!fs.existsSync(config.referencePath)) {
    console.log(
      `[phash] no reference at ${config.referencePath} → OCR will see every frame`,
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
    // Stream overlays (face-cam, chat) change the whole-frame hash, so a
    // reference from a clean capture can reject every frame. Finding nothing
    // is worse than a slower run: fall back to OCR on every frame.
    console.warn(
      "[phash] 0 frames matched the reference (stream overlays?) → OCR will see every frame",
    );
    return frames;
  }
  return survivors;
}

/**
 * Runs one video through the pipeline: download → sample → (pHash) → OCR →
 * dedup → (Azure analysis) → manifest.json. Every stage is resumable from
 * disk, so a crashed weekly run picks up where it stopped.
 *
 * In bootstrap mode the first confirmed scoreboard is saved as the game's
 * pHash reference instead.
 */
export async function harvestVideo(args: {
  mode: HarvestMode;
  profile: GameProfile;
  config: ResolvedConfig;
  deps: DepCheckResult;
  url?: string;
  video?: string;
  /** Required when `config.analyze` is on (see pipeline/analyze.ts). */
  players?: Player[];
}): Promise<HarvestResult> {
  const { mode, profile, config, deps, url, video } = args;
  const startTime = Date.now();
  if (!deps.ocrEngine) throw new Error("No OCR engine available");

  const { filePath, videoId, workDir, durationSec, downloaded } =
    await acquireVideo({ url, video, config, deps });

  const framesDir = path.join(workDir, "frames");
  const frames = await sampleFrames({
    ffmpegPath: deps.ffmpegPath,
    videoPath: filePath,
    framesDir,
    fps: config.fps,
    mode: config.sampling,
    sampleWidth: config.sampleWidth,
    jpegQuality: config.jpegQuality,
    start: config.start,
    end: config.end,
    durationSec,
  });
  console.log(`[sample] ${frames.length} frames ready`);

  const candidates = await runPhashStage({ mode, frames, config });

  const confirmed = await ocrFrames(candidates, {
    engine: deps.ocrEngine,
    keywords: profile.keywords,
    keywordNoise: profile.keywordNoise,
    minKeywords: config.ocrMinKeywords,
    endScreenSentinels: profile.endScreenSentinels,
    requireEndScreen: config.requireEndScreen,
    dedupGapSec: config.dedupGapSec,
    skipAheadSec: mode === "bootstrap" ? 0 : config.skipAheadSec,
    concurrency: config.ocrConcurrency,
  });
  console.log(
    `[ocr] ${confirmed.length} confirmed scoreboard frames` +
      (config.requireEndScreen ? " (require-end-screen=on)" : ""),
  );

  if (mode === "bootstrap") {
    if (confirmed.length === 0)
      throw new Error("[bootstrap] no scoreboards found, cannot save reference");
    fs.mkdirSync(path.dirname(config.referencePath), { recursive: true });
    fs.copyFileSync(confirmed[0].filePath, config.referencePath);
    console.log(`[bootstrap] saved reference → ${config.referencePath}`);
  }

  let matches =
    mode === "extract"
      ? await dedupAndSave({
          confirmed,
          outDir: workDir,
          gapSec: config.dedupGapSec,
        })
      : [];
  if (mode === "extract")
    console.log(`[dedup] saved ${matches.length} match screenshot(s)`);

  if (config.analyze && matches.length > 0) {
    if (!profile.azureGameId)
      throw new Error(`${profile.displayName} has no azureGameId to analyze with`);
    matches = await analyzeMatches({
      matches,
      workDir,
      gameId: profile.azureGameId,
      players: args.players ?? [],
    });
  }

  const manifest: Manifest = {
    game: profile.id,
    source: {
      url,
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
