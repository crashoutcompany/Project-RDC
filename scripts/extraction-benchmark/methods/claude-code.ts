import fs from "fs";
import path from "path";
import { BENCH_DIR } from "../config";
import { fromLlmOutput } from "../normalize";
import { buildSchema, type ScoreboardOutput } from "../prompt";
import type { ExtractInput, ExtractResult, Method } from "./types";

/**
 * Claude read in a Claude Code session, not through the API. The session reads
 * each image blind and writes its answer to
 * `<BENCH_DIR>/claude-code/<game>/<case>.json` in the same schema the API
 * methods use. This method only ingests those files, so the scorer treats it
 * exactly like every other method.
 *
 * Each file may include `latencyMs` (wall-clock time the session took) and
 * `inputTokens` / `outputTokens` when they're known. Subscription usage isn't
 * billed per call, so cost is reported as n/a.
 */
export const claudeCodeMethod: Method = {
  id: "claude-code",
  provider: "claude-code",
  model: "Claude (Claude Code session)",
  price: { kind: "subscription" },
  env: [],
  async extract({ spec, testCase }: ExtractInput): Promise<ExtractResult> {
    const file = path.join(BENCH_DIR, "claude-code", spec.id, `${testCase.id}.json`);
    if (!fs.existsSync(file))
      throw new Error(`no Claude Code transcription at ${file}`);
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as ScoreboardOutput & {
      latencyMs?: number;
      inputTokens?: number;
      outputTokens?: number;
    };
    const parsed = buildSchema(spec).safeParse(raw);
    return {
      prediction: parsed.success ? fromLlmOutput(spec, parsed.data) : null,
      schemaValid: parsed.success,
      usage: {
        inputTokens: raw.inputTokens ?? null,
        outputTokens: raw.outputTokens ?? null,
        reasoningTokens: null,
      },
      servedBy: "claude (Claude Code session)",
      raw,
    };
  },
};
