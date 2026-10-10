import fs from "fs";
import path from "path";
import { BENCH_DIR } from "../config";
import { fromLlmOutput } from "../normalize";
import { buildSchema, type ScoreboardOutput } from "../prompt";
import type { ExtractInput, ExtractResult, Method } from "./types";

export type ClaudeModel = "haiku" | "sonnet" | "opus";

/**
 * A Claude model read through Claude Code subagents (not the API). Each model
 * gets its own subagent run; `blind.ts ingest` copies their answers to
 * `<BENCH_DIR>/claude/<model>/<game>/<case>.json`. This method reads those files
 * and scores them like any other method.
 *
 * Subagent calls draw on plan usage, not per-call billing, so cost is n/a.
 */
export function claudeReaderMethod(model: ClaudeModel): Method {
  return {
    id: `claude-${model}`,
    provider: "claude-code",
    model: `Claude ${model[0].toUpperCase()}${model.slice(1)} (Claude Code subagent)`,
    price: { kind: "subscription" },
    env: [],
    async extract({ spec, testCase }: ExtractInput): Promise<ExtractResult> {
      const file = path.join(BENCH_DIR, "claude", model, spec.id, `${testCase.id}.json`);
      if (!fs.existsSync(file)) throw new Error(`no ${model} reading at ${file}`);
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as ScoreboardOutput;
      const parsed = buildSchema(spec).safeParse(raw);
      return {
        prediction: parsed.success ? fromLlmOutput(spec, parsed.data) : null,
        schemaValid: parsed.success,
        usage: { inputTokens: null, outputTokens: null, reasoningTokens: null },
        servedBy: `claude-${model} (subagent)`,
        raw,
      };
    },
  };
}
