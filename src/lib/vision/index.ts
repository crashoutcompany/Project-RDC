import "server-only";
import type { Player } from "@/generated/prisma/client";
import { PLAYER_MAPPINGS } from "@/app/(routes)/admin/_utils/player-mappings";
import type { VisionProvider } from "./types";
import { azureDocumentIntelligenceProvider } from "./providers/azure-di";
import { createLlmVisionProvider } from "./providers/llm";

export type {
  VisionProvider,
  VisionExtractInput,
  ExtractedScoreboard,
  ExtractedPlayer,
  ExtractedTeam,
} from "./types";
export { toLegacyAnalyzed } from "./bridge";

/**
 * Selects the active vision provider from env. Defaults to the existing
 * Azure Document Intelligence path, so nothing changes until you opt in.
 *
 *   VISION_PROVIDER=azure-di (default) | llm
 *   VISION_MODEL="local:qwen3.5:7b" | "azure:<deployment>" | "google:gemini-2.5-flash"
 *
 * `local:` models are only reachable from `pnpm dev` or a self-hosted
 * deployment; a Vercel server action cannot reach localhost or your LAN.
 */
export const getVisionProvider = (): VisionProvider => {
  const providerKind = process.env.VISION_PROVIDER || "azure-di";

  switch (providerKind) {
    case "llm":
      return createLlmVisionProvider();
    case "azure-di":
      return azureDocumentIntelligenceProvider;
    default:
      throw new Error(`Unknown VISION_PROVIDER: ${providerKind}`);
  }
};

/** Known names/gamertags for this session's players, to help a provider match scoreboard rows to a roster. */
export const buildRosterHint = (sessionPlayers: Player[]): string[] =>
  sessionPlayers.flatMap((player) => {
    const mapping =
      PLAYER_MAPPINGS[player.playerName as keyof typeof PLAYER_MAPPINGS];
    return mapping
      ? [mapping.playerName, ...mapping.gamerTags]
      : [player.playerName];
  });
