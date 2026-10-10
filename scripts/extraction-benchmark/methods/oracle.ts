import { NO_USAGE, type ExtractInput, type ExtractResult, type Method } from "./types";

/**
 * Returns the database answer. Not a contender: it proves the scorer gives
 * 100% to a perfect reading, and lets the whole pipeline run with no keys.
 */
export const oracleMethod: Method = {
  id: "oracle",
  provider: "oracle",
  model: "ground truth",
  price: { kind: "free" },
  env: [],
  async extract({ testCase }: ExtractInput): Promise<ExtractResult> {
    const prediction = {
      players: testCase.expected.players.map((p) => ({
        playerId: p.playerId,
        label: p.name,
        team: null,
        stats: { ...p.stats },
      })),
      winnerIds: [...testCase.expected.winnerIds],
    };
    return { prediction, schemaValid: true, usage: NO_USAGE, servedBy: null, raw: prediction };
  },
};
