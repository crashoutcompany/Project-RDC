import type { Player } from "@/generated/prisma/client";
import { VisionResultCodes } from "@/lib/constants";
import type { AnalysisResults } from "@/lib/visionTypes";
import {
  createDocumentIntelligenceClient,
  extractWithAzure,
  processScoreboard,
  type DocumentIntelligenceClient,
} from "./analyze-scoreboard";
import { classificationOf, withRetry, type RetryOptions } from "./api-errors";
import { extractWithGemini } from "./gemini-reader";
import { specForGameId } from "./scoreboard-specs";

export const READER_IDS = ["gemini", "azure", "llm"] as const;
export type ReaderId = (typeof READER_IDS)[number];

export interface ReadInput {
  /** Bare base64 image (PNG, JPEG or WebP). */
  base64Source: string;
  gameId: number;
  /** Players a row can map to; the harvester passes every member. */
  sessionPlayers: Player[];
}

/**
 * Reads one scoreboard screenshot into the admin form's result shape. Throws
 * on provider errors so the chain can retry or fall back.
 */
export interface ScoreboardReader {
  id: ReaderId;
  supports(gameId: number): boolean;
  read(input: ReadInput): Promise<AnalysisResults>;
}

export function geminiReader(opts: { apiKey?: string; model?: string } = {}): ScoreboardReader {
  return {
    id: "gemini",
    supports: (gameId) => specForGameId(gameId) !== undefined,
    async read({ base64Source, gameId, sessionPlayers }) {
      const fields = await extractWithGemini({ base64Source, gameId, ...opts });
      return processScoreboard({ fields, gameId, sessionPlayers, ocrCorrections: false });
    },
  };
}

export function azureReader(opts: { endpoint?: string; key?: string; client?: DocumentIntelligenceClient }): ScoreboardReader {
  let client = opts.client;
  return {
    id: "azure",
    supports: () => true,
    async read({ base64Source, gameId, sessionPlayers }) {
      if (!client) {
        if (!opts.endpoint || !opts.key)
          throw new Error("DOCUMENT_INTELLIGENCE_ENDPOINT and DOCUMENT_INTELLIGENCE_API_KEY must be set to use Azure");
        client = createDocumentIntelligenceClient(opts.endpoint, opts.key);
      }
      const fields = await extractWithAzure({ client, base64Source, gameId });
      if (!fields) return { status: VisionResultCodes.Failed, message: "Azure returned no document" };
      return processScoreboard({ fields, gameId, sessionPlayers, ocrCorrections: true });
    },
  };
}

export interface LlmReaderOptions {
  /** `<providerId>:<modelId>` for the AI SDK registry (see `models.ts`); defaults to `VISION_MODEL`. */
  modelSpec?: string;
  /** Where to flush telemetry. The default `after()` only works inside a Next request; CLIs pass an inline flush. */
  scheduleFlush?: (flush: () => Promise<void>) => void;
}

/**
 * Any model the AI SDK registry can reach (a local Ollama/vLLM server, Azure
 * OpenAI, another Gemini model), asked for every stat `STAT_CONFIGS` defines
 * for the game, so it also covers games without a scoreboard spec or a trained
 * Azure model. Opt-in: `VISION_PROVIDER=llm` in the app, `--reader llm` in the
 * harvester. Imported lazily so the default path never loads the extra SDKs.
 */
export function llmReader(opts: LlmReaderOptions = {}): ScoreboardReader {
  return {
    id: "llm",
    supports: () => true,
    async read({ base64Source, gameId, sessionPlayers }) {
      const [{ createLlmVisionProvider }, { buildRosterHint }, { toLegacyAnalyzed }] = await Promise.all([
        import("./providers/llm"),
        import("./index"),
        import("./bridge"),
      ]);
      const scoreboard = await createLlmVisionProvider(opts.modelSpec, {
        scheduleFlush: opts.scheduleFlush,
      }).extract({
        imageBase64: base64Source,
        gameId,
        rosterHint: buildRosterHint(sessionPlayers),
      });
      return processScoreboard({
        fields: toLegacyAnalyzed(scoreboard, gameId),
        gameId,
        sessionPlayers,
        ocrCorrections: false,
      });
    },
  };
}

export interface FallbackRecord {
  from: ReaderId;
  reason: string;
}

export interface ReadOutcome {
  result: AnalysisResults;
  /** Reader that produced `result` (the last one tried, if all failed). */
  readerId: ReaderId;
  fallbacks: FallbackRecord[];
}

/**
 * Tries each reader in order. Retryable errors (429, 5xx, timeouts) are retried
 * with backoff first; fatal ones (auth, quota, bad output) and a Failed result
 * move straight to the next reader. Games a reader doesn't support are skipped.
 * Never throws: if every reader fails, the result is Failed with each reason.
 */
export async function readWithFallback(
  readers: ScoreboardReader[],
  input: ReadInput,
  opts: { retry?: RetryOptions; onFallback?: (record: FallbackRecord) => void } = {},
): Promise<ReadOutcome> {
  const fallbacks: FallbackRecord[] = [];
  const fail = (record: FallbackRecord) => {
    fallbacks.push(record);
    opts.onFallback?.(record);
  };
  let last: ReaderId = readers[0]?.id ?? "gemini";

  for (const reader of readers) {
    last = reader.id;
    if (!reader.supports(input.gameId)) {
      fail({ from: reader.id, reason: `doesn't support game ${input.gameId}` });
      continue;
    }
    try {
      const result = await withRetry(() => reader.read(input), opts.retry);
      if (result.status !== VisionResultCodes.Failed) return { result, readerId: reader.id, fallbacks };
      fail({ from: reader.id, reason: result.message });
    } catch (err) {
      fail({ from: reader.id, reason: classificationOf(err).reason });
    }
  }

  return {
    result: {
      status: VisionResultCodes.Failed,
      message: fallbacks.map((f) => `${f.from}: ${f.reason}`).join("; ") || "No readers configured",
    },
    readerId: last,
    fallbacks,
  };
}

/** Both readers, configured from whatever keys the caller has (the app's config, or env in the harvester). */
export function createReaders(keys: {
  geminiApiKey?: string;
  azureEndpoint?: string;
  azureKey?: string;
  llm?: LlmReaderOptions;
}): Record<ReaderId, ScoreboardReader> {
  return {
    gemini: geminiReader({ apiKey: keys.geminiApiKey }),
    azure: azureReader({ endpoint: keys.azureEndpoint, key: keys.azureKey }),
    llm: llmReader(keys.llm),
  };
}

/**
 * `--reader gemini` → Gemini then Azure; `--reader azure` → Azure only;
 * `--reader llm` → the configured LLM, then Gemini, then Azure.
 */
export function readerChain(primary: ReaderId, all: Record<ReaderId, ScoreboardReader>): ScoreboardReader[] {
  if (primary === "llm") return [all.llm, all.gemini, all.azure];
  return primary === "gemini" ? [all.gemini, all.azure] : [all.azure];
}

/**
 * The app's primary reader from `VISION_PROVIDER`: `llm` or `azure-di` opt out of
 * the Gemini default. Anything else (including unset) keeps Gemini first.
 */
export function primaryReaderFromEnv(env: string | undefined = process.env.VISION_PROVIDER): ReaderId {
  if (env === "llm") return "llm";
  if (env === "azure-di") return "azure";
  return "gemini";
}
