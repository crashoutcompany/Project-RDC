import type { StatName } from "@/lib/stat-names";

/** What the database says one scoreboard contains. */
export interface ExpectedScoreboard {
  /** RDC members on the scoreboard, with every on-screen stat. */
  players: { playerId: number; name: string; stats: Partial<Record<StatName, string>> }[];
  /** Members credited with the win (a whole team, or the solo winner). */
  winnerIds: number[];
}

export interface DatasetCase {
  /** Stable id, e.g. "match-01". Output files are keyed by it. */
  id: string;
  /** Absolute path to the PNG every method reads. */
  image: string;
  /** Database match this image was paired with. */
  matchId: number;
  /** Position in the source video, when known (finder test ground truth). */
  timestampSec?: number;
  expected: ExpectedScoreboard;
}

export interface Dataset {
  name: string;
  /** Game profile id from games.ts. */
  game: string;
  source: { sessionId: number; videoId: string; recordedMatches: number };
  /** How images were paired with database matches, for the write-up. */
  pairing: string;
  cases: DatasetCase[];
}

/** One method's reading of one scoreboard, normalized for scoring. */
export interface Prediction {
  players: {
    /** RDC member id, or null for a row nobody could map (randoms, misreads). */
    playerId: number | null;
    /** What was read off the screen, for error analysis. */
    label: string;
    team: string | null;
    stats: Partial<Record<StatName, string | null>>;
  }[];
  /** Member ids the method says won. */
  winnerIds: number[];
}

export interface Usage {
  inputTokens: number | null;
  outputTokens: number | null;
  /** Thinking/reasoning tokens, already included in outputTokens. */
  reasoningTokens: number | null;
  /** Input + output together, for methods that only report a combined count. */
  totalTokens?: number | null;
}

/** One API call, as logged to calls.jsonl. */
export interface CallRecord {
  method: string;
  caseId: string;
  repeat: number;
  startedAt: string;
  latencyMs: number;
  usage: Usage;
  costUsd: number | null;
  /** The provider's response parsed into our schema. */
  schemaValid: boolean;
  /** Model id the provider reports serving the call. */
  servedBy: string | null;
  error: string | null;
  prediction: Prediction | null;
  /** Raw structured output (or Azure result) for later inspection. */
  raw: unknown;
}
