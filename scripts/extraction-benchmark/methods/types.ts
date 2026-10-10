import type { GameSpec } from "../games";
import type { buildSchema } from "../prompt";
import type { DatasetCase, Prediction, Usage } from "../types";

export interface ExtractInput {
  spec: GameSpec;
  testCase: DatasetCase;
  image: Buffer;
  system: string;
  prompt: string;
  schema: ReturnType<typeof buildSchema>;
}

export interface ExtractResult {
  prediction: Prediction | null;
  schemaValid: boolean;
  usage: Usage;
  servedBy: string | null;
  raw: unknown;
}

/** List prices on the run date. Per 1M tokens, or a flat per-call price. */
export type Price =
  | { kind: "tokens"; inputPerM: number; outputPerM: number }
  | { kind: "call"; perCall: number }
  | { kind: "free" }
  /** Billed through a subscription, not per call: cost is reported as n/a. */
  | { kind: "subscription" };

export interface Method {
  id: string;
  provider: "azure" | "claude-code" | "google" | "oracle";
  model: string;
  price: Price;
  /** Env vars that must be set; the method is skipped (not failed) without them. */
  env: string[];
  extract(input: ExtractInput): Promise<ExtractResult>;
}

export const NO_USAGE: Usage = { inputTokens: null, outputTokens: null, reasoningTokens: null };

export function costOf(price: Price, usage: Usage): number | null {
  if (price.kind === "free") return 0;
  if (price.kind === "subscription") return null;
  if (price.kind === "call") return price.perCall;
  if (usage.inputTokens === null || usage.outputTokens === null) return null;
  return (
    (usage.inputTokens * price.inputPerM + usage.outputTokens * price.outputPerM) / 1_000_000
  );
}
