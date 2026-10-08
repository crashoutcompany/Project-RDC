/**
 * Provider-agnostic scoreboard extraction contract.
 *
 * Every vision provider normalizes its output into this shape. Nothing
 * downstream of `VisionProvider.extract` should know which provider ran —
 * `toLegacyAnalyzed` (see `bridge.ts`) is the only place that translates
 * this into the Azure-shaped types the existing game processors consume.
 */

export interface ExtractedPlayer {
  /** Name or gamertag as read from the screenshot, before roster matching. */
  name: string;
  /** Field key (matches `StatConfig.fieldKey`) to raw stat value. */
  stats: Record<string, string | number>;
  /** Optional 0-1 confidence for this player's row, when the provider has one. */
  confidence?: number;
}

export interface ExtractedTeam {
  /** Provider-agnostic team identifier, e.g. "blue" / "orange". */
  teamKey: string;
  players: ExtractedPlayer[];
}

export interface ExtractedScoreboard {
  /** Present for TEAM games. */
  teams?: ExtractedTeam[];
  /** Present for SOLO games. */
  players?: ExtractedPlayer[];
}

export interface VisionExtractInput {
  /** Raw base64 image bytes (no data: URL prefix). */
  imageBase64: string;
  gameId: number;
  /** Known player names/gamertags for this session, to help the provider match rows to a roster. */
  rosterHint: string[];
}

export interface VisionProvider {
  /** Stable identifier used for logging/telemetry (e.g. "azure-di", "llm:google:gemini-2.5-flash"). */
  id: string;
  extract(input: VisionExtractInput): Promise<ExtractedScoreboard>;
}
