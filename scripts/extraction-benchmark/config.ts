import os from "os";
import path from "path";
import { azureMethod } from "./methods/azure";
import { claudeReaderMethod } from "./methods/claude-reader";
import { geminiMethod } from "./methods/gemini";
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
 * Every stat reader in the experiment. Access rules, set by the user:
 * - Claude runs through Claude Code subagents (`claude-haiku|sonnet|opus`), never the API.
 * - OpenAI is used only through the Decisions API, and only gpt-6-luna. So no
 *   OpenAI model reads stats; Decisions is the scoreboard finder below.
 * - Gemini runs through the Vercel AI SDK with structured output. gemini-2.5-flash
 *   is no longer open to new users, so only the 3.x Flash model is measured.
 * Gemini reasoning is set to its "low" level so it gets no more thinking than
 * the other readers.
 */
export const METHODS: Method[] = [
  azureMethod({ kind: "call", perCall: 0.03 }),
  azureMethod({ kind: "call", perCall: 0.03 }, true),
  claudeReaderMethod("haiku"),
  claudeReaderMethod("sonnet"),
  claudeReaderMethod("opus"),
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

/** Methods run by default. `oracle` is a self-check; Claude readers need subagent answers first. */
const OPT_IN = new Set(["azure-roster", "oracle", "claude-haiku", "claude-sonnet", "claude-opus"]);

export function resolveMethods(ids: string[] | undefined): Method[] {
  if (!ids || ids.length === 0) return METHODS.filter((m) => !OPT_IN.has(m.id));
  return ids.map((id) => {
    const method = METHODS.find((m) => m.id === id);
    if (!method)
      throw new Error(`Unknown method "${id}". Known: ${METHODS.map((m) => m.id).join(", ")}`);
    return method;
  });
}
