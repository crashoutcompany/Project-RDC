/**
 * Per-game translation between the provider-agnostic team key used in
 * `ExtractedScoreboard` (e.g. "blue" / "orange") and the literal Azure
 * Document Intelligence field name the existing `GameProcessor`s expect.
 *
 * `RocketLeagueProcessor.processPlayers` only recognizes a team whose
 * `teamName` is exactly a key of `RL_TEAM_MAPPING` ("BluePlayers" /
 * "OrangePlayers") — anything else is silently skipped. That name is also
 * what ends up on `VisionPlayer.teamKey` throughout the pipeline, so both
 * providers need to agree on it after the bridge.
 *
 * Add an entry here whenever a new TEAM game gets vision support.
 */
export const TEAM_KEY_TO_LEGACY_NAME: Record<number, Record<string, string>> =
  {
    2: { blue: "BluePlayers", orange: "OrangePlayers" }, // Rocket League
  };

export const teamKeyToLegacyName = (gameId: number, teamKey: string): string =>
  TEAM_KEY_TO_LEGACY_NAME[gameId]?.[teamKey] ?? teamKey;

export const legacyNameToTeamKey = (
  gameId: number,
  legacyName: string,
): string => {
  const map = TEAM_KEY_TO_LEGACY_NAME[gameId];
  if (!map) return legacyName;
  const entry = Object.entries(map).find(([, name]) => name === legacyName);
  return entry?.[0] ?? legacyName;
};
