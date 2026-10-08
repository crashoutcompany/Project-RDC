import fs from "fs";
import path from "path";
import { generateText, Output } from "ai";
import z from "zod";
import { visionModelRegistry } from "@/lib/vision/models";
import type { VisionModelId } from "@/lib/vision/providers/llm";
import type { GameProfile } from "../../games/types";
import type { FrameRecord } from "../../types";
import { buildContactSheet } from "../contact-sheet";
import { DetectionCache, hashFile } from "../detection-cache";
import type { FrameClassifier, FrameVerdict } from "../detect";

/** Bump when the prompt or schema changes meaning, so stale cached verdicts aren't reused. */
const PROMPT_VERSION = 1;

export const TILE_KINDS = [
  "post-match",
  "in-match-scoreboard",
  "other",
] as const;
export type TileKind = (typeof TILE_KINDS)[number];

export interface TileResult {
  kind: TileKind;
  confidence: number;
}

// Kept lenient (no int/range constraints) so one sloppy number doesn't fail
// schema validation for the whole sheet; parseTileResults normalizes.
const sheetSchema = z.object({
  tiles: z.array(
    z.object({
      index: z.number().describe("The tile number printed in its top-left corner"),
      kind: z.enum(TILE_KINDS),
      confidence: z.number().describe("0 to 1"),
    }),
  ),
});

export type SheetResponse = z.infer<typeof sheetSchema>;

export interface ParsedTiles {
  /** One result per tile, in tile order. */
  results: TileResult[];
  /** Tiles the response didn't cover; their "other" result must not be cached. */
  missing: boolean[];
  problems: string[];
}

/**
 * Normalizes a model's per-tile answers into exactly `count` results.
 * Missing tiles default to "other"; out-of-range and duplicate indices are
 * dropped (first answer wins); confidence is clamped to 0..1.
 *
 * @param response - Parsed structured output from the model.
 * @param count - Tiles on the sheet.
 * @returns One result per tile plus any problems worth warning about.
 */
export function parseTileResults(
  response: SheetResponse | undefined,
  count: number,
): ParsedTiles {
  const results: (TileResult | undefined)[] = new Array(count).fill(undefined);
  const problems: string[] = [];

  for (const tile of response?.tiles ?? []) {
    const index = Math.round(tile.index);
    if (index < 1 || index > count) {
      problems.push(`out-of-range tile ${tile.index}`);
      continue;
    }
    if (results[index - 1]) {
      problems.push(`duplicate tile ${index}`);
      continue;
    }
    const confidence = Number.isFinite(tile.confidence)
      ? Math.min(1, Math.max(0, tile.confidence))
      : 0;
    results[index - 1] = { kind: tile.kind, confidence };
  }

  const missing = results.map((r) => r === undefined);
  const missingCount = missing.filter(Boolean).length;
  if (missingCount > 0) problems.push(`${missingCount} tile(s) missing`);

  return {
    results: results.map((r) => r ?? { kind: "other", confidence: 0 }),
    missing,
    problems,
  };
}

/** Applies the confidence threshold. Kept out of the cache so changing it is free. */
export function toVerdict(
  result: TileResult,
  minConfidence: number,
): FrameVerdict {
  return {
    isScoreboard:
      result.kind === "post-match" && result.confidence >= minConfidence,
    confidence: result.confidence,
    evidence: [`${result.kind}@${result.confidence.toFixed(2)}`],
  };
}

export function buildDetectPrompt(profile: GameProfile, count: number): string {
  return [
    `You are screening frames sampled from a ${profile.displayName} video to find the end-of-match results screen.`,
    `The image is a grid of ${count} separate video frame${count === 1 ? "" : "s"}, each labeled with a number in a yellow box in its top-left corner (numbered left-to-right, top-to-bottom).`,
    "",
    "Classify every tile:",
    `- "post-match": ${profile.ai.description}`,
    `- "in-match-scoreboard": a scoreboard overlaid on live gameplay.`,
    `- "other": anything else, including: ${profile.ai.reject}`,
    "",
    "Webcam overlays, stream borders, or chat on top of the game are normal and do not change the answer.",
    `Return exactly one entry per tile (indices 1-${count}) with a confidence from 0 to 1.`,
  ].join("\n");
}

export interface AiClassifierOptions {
  profile: GameProfile;
  /** `<providerId>:<modelId>`, e.g. "google:gemini-2.5-flash" or "local:qwen2.5vl:7b". */
  modelSpec: string;
  /** Tiles per side of each contact sheet (1 = one frame per request). */
  grid: number;
  minConfidence: number;
  /** JSONL file for cached tile results. */
  cachePath: string;
  sheetWidth?: number;
  /** When set, every sheet sent to the model is also written here. */
  debugDir?: string;
}

/**
 * Vision-model detector. Tiles up to grid² frames into one numbered contact
 * sheet per request, so a model call covers several frames; tiles only need
 * to show the screen's layout, not legible stats. Results are cached by
 * frame content hash + model + grid, so a re-run with the same settings makes
 * no model calls.
 *
 * @param opts - Model, profile, grid and cache settings.
 * @returns A FrameClassifier for `detectFrames`.
 */
export function createAiClassifier(opts: AiClassifierOptions): FrameClassifier {
  const { profile, modelSpec, grid, minConfidence, debugDir } = opts;
  const sheetWidth = opts.sheetWidth ?? 1280;
  // Fail fast on an unknown provider prefix instead of once per batch.
  const model = visionModelRegistry.languageModel(modelSpec as VisionModelId);
  const cache = new DetectionCache<TileResult>(opts.cachePath);
  const keyPrefix = `ai|v${PROMPT_VERSION}|${modelSpec}|g${grid}|`;
  if (debugDir) fs.mkdirSync(debugDir, { recursive: true });

  let calls = 0;
  let cachedFrames = 0;

  async function classifySheet(frames: FrameRecord[]): Promise<ParsedTiles> {
    const sheet = await buildContactSheet(
      frames.map((f) => f.filePath),
      grid,
      sheetWidth,
    );
    if (debugDir)
      fs.writeFileSync(
        path.join(debugDir, `sheet_${String(frames[0].frameId).padStart(6, "0")}.jpg`),
        sheet,
      );

    calls++;
    const result = await generateText({
      model,
      output: Output.object({ schema: sheetSchema }),
      temperature: 0,
      maxRetries: 4,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildDetectPrompt(profile, frames.length) },
            { type: "file", data: sheet, mediaType: "image/jpeg" },
          ],
        },
      ],
    });

    const parsed = parseTileResults(result.output, frames.length);
    if (parsed.problems.length > 0)
      console.warn(
        `[ai] sheet at frame ${frames[0].frameId}: ${parsed.problems.join(", ")}`,
      );
    return parsed;
  }

  return {
    id: "ai",
    model: modelSpec,
    batchSize: grid * grid,
    classify: async (frames) => {
      const keys = frames.map((f) => keyPrefix + hashFile(f.filePath));
      const results = keys.map((key) => cache.get(key));
      const uncached = frames
        .map((_, i) => i)
        .filter((i) => results[i] === undefined);
      cachedFrames += frames.length - uncached.length;

      if (uncached.length > 0) {
        const parsed = await classifySheet(uncached.map((i) => frames[i]));
        uncached.forEach((frameIndex, tile) => {
          results[frameIndex] = parsed.results[tile];
          if (!parsed.missing[tile])
            cache.set(keys[frameIndex], parsed.results[tile]);
        });
      }

      return results.map((r) => toVerdict(r!, minConfidence));
    },
    close: async () => {
      console.log(
        `[ai] ${calls} model call(s) to ${modelSpec}, ${cachedFrames} frame verdict(s) from cache`,
      );
      calls = 0;
      cachedFrames = 0;
    },
  };
}
