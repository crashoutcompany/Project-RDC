import "server-only";
import { generateText, Output } from "ai";
import { after } from "next/server";
import {
  AI_TELEMETRY_INCLUDE_RUNTIME_CONTEXT,
  AiTelemetryProperty,
  flushAiTelemetry,
} from "@/posthog/ai-telemetry";
import { visionModelRegistry, getVisionModelSpec } from "../models";
import {
  buildGameOutputSchema,
  buildVisionPrompt,
  RawVisionOutput,
  RawVisionPlayer,
} from "../game-specs";
import type {
  ExtractedPlayer,
  ExtractedScoreboard,
  VisionExtractInput,
  VisionProvider,
} from "../types";

/** Client-side upload is restricted to jpeg/png, so we only need to tell those apart. */
export const detectImageMediaType = (base64: string): string => {
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("/9j/")) return "image/jpeg";
  return "image/png";
};

/** Model ids the registry accepts, e.g. "local:qwen3.8:7b" or "azure:gpt-4.1-mini". */
export type VisionModelId =
  `google:${string}` | `local:${string}` | `azure:${string}`;

/** Flat `{ name, ...statFields }` -> the normalized `ExtractedPlayer` contract. */
const toExtractedPlayer = (raw: RawVisionPlayer): ExtractedPlayer => {
  const { name, ...stats } = raw;
  const cleanStats: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(stats)) {
    if (value !== undefined) cleanStats[key] = value;
  }
  return { name, stats: cleanStats };
};

export interface LlmVisionProviderOptions {
  scheduleFlush?: (flush: () => Promise<void>) => void;
}

const scheduleFlushAfterResponse = (flush: () => Promise<void>) => after(flush);

/**
 * LLM-based vision provider: any model reachable through the `ai` SDK
 * provider registry (local OpenAI-compatible server, Azure OpenAI, or
 * Gemini), given a `<providerId>:<modelId>` spec such as
 * "local:qwen3.8-7b" or "azure:gpt-4.1-mini".
 */
export const createLlmVisionProvider = (
  modelSpec: string = getVisionModelSpec(),
  { scheduleFlush = scheduleFlushAfterResponse }: LlmVisionProviderOptions = {},
): VisionProvider => ({
  id: `llm:${modelSpec}`,
  extract: async ({
    imageBase64,
    gameId,
    rosterHint,
  }: VisionExtractInput): Promise<ExtractedScoreboard> => {
    const schema = buildGameOutputSchema(gameId);
    const prompt = buildVisionPrompt(gameId, rosterHint);
    const model = visionModelRegistry.languageModel(modelSpec as VisionModelId);

    try {
      const result = await generateText({
        model,
        output: Output.object({ schema }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "file",
                data: imageBase64,
                mediaType: detectImageMediaType(imageBase64),
              },
            ],
          },
        ],
        // TODO: thread the admin's session email through as distinctId once
        // handleAnalyzeBtnClick's callers pass it, matching analyzeMvp's pattern.
        runtimeContext: {
          traceName: "vision-extract",
          properties: {
            [AiTelemetryProperty.SOURCE]: "vision",
            [AiTelemetryProperty.ENVIRONMENT]: process.env.NODE_ENV,
            gameId,
            modelSpec,
          },
        },
        telemetry: {
          functionId: "vision-extract",
          includeRuntimeContext: AI_TELEMETRY_INCLUDE_RUNTIME_CONTEXT,
        },
      });

      if (!result.output)
        throw new Error("Vision extraction produced no result");

      // the schema's own inferred type
      // isn't trustworthy for its dynamic per-stat fields, so we assert our
      // hand-written contract at this one boundary instead.
      const raw = result.output as unknown as RawVisionOutput;

      return {
        teams: raw.teams?.map((team) => ({
          teamKey: team.teamKey,
          players: team.players.map(toExtractedPlayer),
        })),
        players: raw.players?.map(toExtractedPlayer),
      };
    } finally {
      scheduleFlush(() => flushAiTelemetry());
    }
  },
});
