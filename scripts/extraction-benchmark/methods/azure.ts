import type { Player } from "@/generated/prisma/client";
import { VisionResultCodes } from "@/lib/constants";
import {
  analyzeScoreboard,
  createDocumentIntelligenceClient,
  type DocumentIntelligenceClient,
} from "@/lib/vision/analyze-scoreboard";
import { PLAYER_MAPPINGS } from "@/app/(routes)/admin/_utils/player-mappings";
import { fromAzureResult } from "../normalize";
import { NO_USAGE, type ExtractInput, type ExtractResult, type Method, type Price } from "./types";

/**
 * The production path: the game's custom Document Intelligence model plus its
 * processor, called exactly as the admin "RDC Vision" button calls it. Azure
 * gets no prompt; the processor maps gamertags itself.
 */
export function azureMethod(price: Price): Method {
  let client: DocumentIntelligenceClient | undefined;
  const players = Object.values(PLAYER_MAPPINGS).map(
    (p) => ({ playerId: p.playerId, playerName: p.playerName }) as Player,
  );
  return {
    id: "azure",
    provider: "azure",
    model: "custom document model (per game)",
    price,
    env: ["DOCUMENT_INTELLIGENCE_ENDPOINT", "DOCUMENT_INTELLIGENCE_API_KEY"],
    async extract({ spec, image }: ExtractInput): Promise<ExtractResult> {
      client ??= createDocumentIntelligenceClient(
        process.env.DOCUMENT_INTELLIGENCE_ENDPOINT!,
        process.env.DOCUMENT_INTELLIGENCE_API_KEY!,
      );
      const result = await quietly(() =>
        analyzeScoreboard({
          client: client!,
          base64Source: image.toString("base64"),
          sessionPlayers: players,
          gameId: spec.gameId,
        }),
      );
      if (result.status === VisionResultCodes.Failed)
        return { prediction: null, schemaValid: false, usage: NO_USAGE, servedBy: null, raw: result };
      return {
        prediction: fromAzureResult(result.data),
        schemaValid: true,
        usage: NO_USAGE,
        servedBy: null,
        raw: result,
      };
    },
  };
}

/** The processors log every field; keep the benchmark output readable. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const { log, warn, error } = console;
  console.log = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, warn, error });
  }
}
