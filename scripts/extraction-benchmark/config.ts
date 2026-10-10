import os from "os";
import path from "path";
import { anthropicMethod } from "./methods/anthropic";
import { azureMethod } from "./methods/azure";
import { geminiMethod } from "./methods/gemini";
import { openaiMethod } from "./methods/openai";
import { oracleMethod } from "./methods/oracle";
import type { Method } from "./methods/types";

/** Where datasets, raw outputs, logs, and reports live (outside the repo). */
export const BENCH_DIR = process.env.BENCH_DIR ?? path.join(os.homedir(), "ocrbench", "experiment");

export const DEFAULT_REPEATS = 3;

/**
 * List prices checked on PRICES_CHECKED. Re-check before a run and update
 * here; reports print this date next to every cost.
 * Sources: platform.claude.com pricing, developers.openai.com/api/docs/pricing,
 * ai.google.dev/gemini-api/docs/pricing, and third-party listings for Azure
 * custom extraction (Microsoft's page didn't render; verify in the portal).
 */
export const PRICES_CHECKED = "2026-10-10";

/**
 * Every stat reader in the experiment. Reasoning is set to each provider's
 * "low" level so no model gets more thinking than another.
 */
export const METHODS: Method[] = [
  azureMethod({ kind: "call", perCall: 0.03 }),
  anthropicMethod("claude-haiku-5-5", "claude-haiku-5-5", { kind: "tokens", inputPerM: 0.1, outputPerM: 0.5 }),
  anthropicMethod("claude-sonnet-5-5", "claude-sonnet-5-5", { kind: "tokens", inputPerM: 2, outputPerM: 10 }),
  anthropicMethod("claude-opus-5-5", "claude-opus-5-5", { kind: "tokens", inputPerM: 4, outputPerM: 20 }),
  openaiMethod("gpt-6-luna", "gpt-6-luna", { kind: "tokens", inputPerM: 0.1, outputPerM: 0.5 }),
  openaiMethod("gpt-6-sol", "gpt-6-sol", { kind: "tokens", inputPerM: 2, outputPerM: 10 }),
  // Gemini 2.5 has no thinking levels; a 1,024-token budget is its "low".
  geminiMethod("gemini-2.5-flash", "gemini-2.5-flash", { kind: "tokens", inputPerM: 0.3, outputPerM: 2.5 }, { thinkingBudget: 1024 }),
  // Intro price through 2026-12-31; it doubles to $1.50 / $7.50 after.
  geminiMethod("gemini-3.8-flash", "gemini-3.8-flash", { kind: "tokens", inputPerM: 0.75, outputPerM: 3.75 }, { thinkingLevel: "low" }),
  oracleMethod,
];

/** Decisions API (scoreboard finder): input tokens only. */
export const DECISIONS = {
  model: "gpt-6-luna",
  inputPerM: 0.1,
  /** Probability at which a frame counts as a scoreboard; the report also sweeps others. */
  threshold: 0.5,
  concurrency: 4,
};

/** Weekly volume used to project costs: 4 videos × ~13 scoreboards. */
export const WEEKLY_SCOREBOARDS = 52;
export const WEEKLY_VIDEOS = 4;

export function resolveMethods(ids: string[] | undefined): Method[] {
  if (!ids || ids.length === 0) return METHODS.filter((m) => m.id !== "oracle");
  return ids.map((id) => {
    const method = METHODS.find((m) => m.id === id);
    if (!method)
      throw new Error(`Unknown method "${id}". Known: ${METHODS.map((m) => m.id).join(", ")}`);
    return method;
  });
}
