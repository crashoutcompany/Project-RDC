import path from "path";
import { getVisionModelSpec } from "@/lib/vision/models";
import type { GameProfile } from "../games/types";
import type { FrameRecord, OcrRecord, ResolvedConfig } from "../types";
import { createAiClassifier } from "./classifiers/ai";
import { clusterConsecutive } from "./dedup";
import {
  detectFrames,
  selectCoarseFrames,
  selectRefineFrames,
} from "./detect";

/**
 * `--finder ai`: a vision model classifies tiled contact sheets of frames, on
 * any OS and with any model the AI SDK registry can reach (`--ai-model`).
 *
 * A coarse pass looks at one frame per `ai.strideSec` (with skip-ahead, since
 * no match is shorter than the game's `minMatchIntervalSec`). Unless
 * `--no-refine`, a second pass then classifies every skipped frame around each
 * coarse hit, so dedup, which keeps a run's earliest frame, sees the whole run
 * rather than every Nth frame of it. Verdicts are cached by frame content in
 * `detections.jsonl`, so a rerun with the same model and grid is free.
 *
 * Imported lazily by `findScoreboards`: it pulls in the AI SDK providers and
 * `server-only`, which need `scripts/tsconfig.json` (`pnpm harvest` passes it).
 */
export async function findWithAi(args: {
  frames: FrameRecord[];
  profile: GameProfile;
  config: ResolvedConfig;
  workDir: string;
}): Promise<{ confirmed: OcrRecord[]; model: string }> {
  const { frames, profile, config, workDir } = args;
  const { ai } = config;
  const model = ai.model ?? (process.env.HARVEST_DETECT_MODEL || getVisionModelSpec());
  if (!profile.ai)
    throw new Error(
      `--finder ai needs an "ai" block on the "${profile.id}" game profile (see games/README.md)`,
    );

  const classifier = createAiClassifier({
    profile: { ...profile, ai: profile.ai },
    modelSpec: model,
    grid: ai.grid,
    minConfidence: ai.minConfidence,
    cachePath: path.join(workDir, "detections.jsonl"),
    debugDir: config.keepFrames ? path.join(workDir, "sheets") : undefined,
  });
  const pass = (passFrames: FrameRecord[], skipAheadSec: number, label: string) =>
    detectFrames(passFrames, classifier, {
      dedupGapSec: config.dedupGapSec,
      skipAheadSec,
      concurrency: ai.concurrency,
      label,
    });

  try {
    const coarse = selectCoarseFrames(frames, ai.strideSec);
    console.log(
      `[ai] coarse pass: ${coarse.length}/${frames.length} frames (one per ${ai.strideSec}s), model=${model}, grid=${ai.grid}x${ai.grid}`,
    );
    const coarseHits = await pass(coarse, config.skipAheadSec, "ai");
    if (!ai.refine || coarse.length === frames.length || coarseHits.length === 0)
      return { confirmed: coarseHits, model };

    const refineFrames = selectRefineFrames(
      frames,
      clusterConsecutive(coarseHits, config.dedupGapSec),
      ai.strideSec,
      new Set(coarse.map((f) => f.frameId)),
    );
    console.log(`[ai] refine pass: ${refineFrames.length} frames around coarse hits`);
    const refineHits = await pass(refineFrames, 0, "ai:refine");
    return {
      confirmed: [...coarseHits, ...refineHits].sort(
        (a, b) => a.timestampSec - b.timestampSec,
      ),
      model,
    };
  } finally {
    await classifier.close();
  }
}
