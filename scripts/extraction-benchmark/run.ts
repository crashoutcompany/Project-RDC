import fs from "fs";
import os from "os";
import path from "path";
import { PRICES_CHECKED } from "./config";
import { resolveGame } from "./games";
import { costOf, type Method } from "./methods/types";
import { buildPrompt, buildSchema, promptFingerprint, SYSTEM_PROMPT } from "./prompt";
import type { CallRecord, Dataset } from "./types";

export interface RunOptions {
  dataset: Dataset;
  methods: Method[];
  repeats: number;
  runDir: string;
  /** Re-run calls that previously errored or failed the schema. */
  retryFailed: boolean;
}

export function readCalls(runDir: string): CallRecord[] {
  const file = path.join(runDir, "calls.jsonl");
  if (!fs.existsSync(file)) return [];
  const latest = new Map<string, CallRecord>();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as CallRecord;
    // A retried call is appended; the last record for a slot wins.
    latest.set(`${record.method}|${record.caseId}|${record.repeat}`, record);
  }
  return [...latest.values()];
}

/**
 * Runs every method over every case `repeats` times. Order is repeat → case →
 * method, so methods interleave and none gets a systematically quieter (or
 * busier) moment on the network. Calls are strictly sequential so latencies
 * aren't skewed by our own parallel load. Safe to interrupt and rerun.
 */
export async function runExtraction(opts: RunOptions): Promise<void> {
  const { dataset, repeats, runDir } = opts;
  const spec = resolveGame(dataset.game);
  fs.mkdirSync(runDir, { recursive: true });

  const missing = opts.methods.filter((m) => m.env.some((name) => !process.env[name]));
  for (const m of missing)
    console.warn(`[run] skipping ${m.id}: set ${m.env.filter((n) => !process.env[n]).join(", ")}`);
  const methods = opts.methods.filter((m) => !missing.includes(m));
  if (methods.length === 0) throw new Error("No runnable methods (missing API keys?)");

  const prompt = buildPrompt(spec);
  const schema = buildSchema(spec);
  const metaPath = path.join(runDir, "run.json");
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        ...meta,
        dataset: dataset.name,
        game: dataset.game,
        cases: dataset.cases.length,
        repeats,
        methods: [...new Set([...(meta.methods ?? []), ...methods.map((m) => m.id)])],
        methodModels: Object.fromEntries(methods.map((m) => [m.id, m.model])),
        promptFingerprint: promptFingerprint(spec),
        pricesChecked: PRICES_CHECKED,
        host: os.hostname(),
        node: process.version,
        startedAt: meta.startedAt ?? new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(runDir, "prompt.txt"), `${SYSTEM_PROMPT}\n\n---\n\n${prompt}\n`);

  const done = new Map(
    readCalls(runDir).map((r) => [`${r.method}|${r.caseId}|${r.repeat}`, r]),
  );
  const log = fs.openSync(path.join(runDir, "calls.jsonl"), "a");
  const total = repeats * dataset.cases.length * methods.length;
  let n = 0;

  try {
    for (let repeat = 1; repeat <= repeats; repeat++)
      for (const testCase of dataset.cases) {
        const image = fs.readFileSync(testCase.image);
        for (const method of methods) {
          n++;
          const key = `${method.id}|${testCase.id}|${repeat}`;
          const prior = done.get(key);
          if (prior && !(opts.retryFailed && (prior.error || !prior.schemaValid))) continue;

          const startedAt = new Date().toISOString();
          const t0 = performance.now();
          let record: CallRecord;
          try {
            const result = await method.extract({ spec, testCase, image, system: SYSTEM_PROMPT, prompt, schema });
            record = {
              method: method.id,
              caseId: testCase.id,
              repeat,
              startedAt,
              latencyMs: result.latencyMs ?? Math.round(performance.now() - t0),
              usage: result.usage,
              costUsd: costOf(method.price, result.usage),
              schemaValid: result.schemaValid,
              servedBy: result.servedBy,
              error: null,
              prediction: result.prediction,
              raw: result.raw,
            };
          } catch (err) {
            record = {
              method: method.id,
              caseId: testCase.id,
              repeat,
              startedAt,
              latencyMs: Math.round(performance.now() - t0),
              usage: { inputTokens: null, outputTokens: null, reasoningTokens: null },
              costUsd: null,
              schemaValid: false,
              servedBy: null,
              error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
              prediction: null,
              raw: null,
            };
          }
          fs.writeSync(log, JSON.stringify(record) + "\n");
          const status = record.error ? `ERROR ${record.error.slice(0, 80)}` : record.schemaValid ? "ok" : "schema-invalid";
          console.log(
            `[run] ${n}/${total} r${repeat} ${testCase.id} ${method.id}: ${status} ${record.latencyMs}ms` +
              (record.usage.inputTokens !== null ? ` in=${record.usage.inputTokens} out=${record.usage.outputTokens}` : ""),
          );
        }
      }
  } finally {
    fs.closeSync(log);
  }
}
