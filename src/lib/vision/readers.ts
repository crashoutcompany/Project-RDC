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

export const READER_IDS = ["gemini", "azure"] as const;
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
}): Record<ReaderId, ScoreboardReader> {
  return {
    gemini: geminiReader({ apiKey: keys.geminiApiKey }),
    azure: azureReader({ endpoint: keys.azureEndpoint, key: keys.azureKey }),
  };
}

/** `--reader gemini` → Gemini then Azure; `--reader azure` → Azure only. */
export function readerChain(primary: ReaderId, all: Record<ReaderId, ScoreboardReader>): ScoreboardReader[] {
  return primary === "gemini" ? [all.gemini, all.azure] : [all.azure];
}
