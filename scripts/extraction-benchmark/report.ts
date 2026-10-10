import fs from "fs";
import path from "path";
import { METHODS, PRICES_CHECKED, WEEKLY_SCOREBOARDS } from "./config";
import { readCalls } from "./run";
import { consistency, percentile, scoreCall, wilson, type CallScore } from "./score";
import type { CallRecord, Dataset } from "./types";

export interface MethodSummary {
  method: string;
  model: string;
  calls: number;
  errors: number;
  schemaInvalid: number;
  repeats: number;
  /** Pooled over all repeats. */
  correct: number;
  cells: number;
  accuracy: number;
  ci95: [number, number];
  /** Mean correct cells per full pass over the dataset (comparable to "367/370"). */
  correctPerPass: number;
  cellsPerPass: number;
  wrongValue: number;
  missingPlayer: number;
  nullValue: number;
  /** Mean per pass: scoreboards where every expected member was found. */
  allPlayersFoundPerPass: number;
  winnerExactPerPass: number;
  winningSidePerPass: number;
  invented: number;
  consistency: number | null;
  latencyMeanMs: number | null;
  latencyP95Ms: number | null;
  totalTimeMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalCostUsd: number | null;
  costPerScoreboard: number | null;
  weeklyCostUsd: number | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const sumOrNull = (xs: (number | null)[]) =>
  xs.every((x) => x === null) ? null : sum(xs.map((x) => x ?? 0));

export function summarize(dataset: Dataset, calls: CallRecord[]): MethodSummary[] {
  const cases = new Map(dataset.cases.map((c) => [c.id, c]));
  const methods = [...new Set(calls.map((c) => c.method))];
  return methods.map((id) => {
    const records = calls.filter((c) => c.method === id && cases.has(c.caseId));
    const scores: CallScore[] = records.map((r) => scoreCall(r, cases.get(r.caseId)!));
    const passes = new Set(records.map((r) => r.repeat)).size || 1;
    const correct = sum(scores.map((s) => s.correct));
    const cells = sum(scores.map((s) => s.cells));
    const latencies = records.filter((r) => !r.error).map((r) => r.latencyMs);
    const totalCost = sumOrNull(records.map((r) => r.costUsd));
    const costed = records.filter((r) => r.costUsd !== null);
    const costPerScoreboard = costed.length ? sum(costed.map((r) => r.costUsd!)) / costed.length : null;
    return {
      method: id,
      model: METHODS.find((m) => m.id === id)?.model ?? id,
      calls: records.length,
      errors: records.filter((r) => r.error).length,
      schemaInvalid: records.filter((r) => !r.error && !r.schemaValid).length,
      repeats: passes,
      correct,
      cells,
      accuracy: cells ? correct / cells : 0,
      ci95: wilson(correct, cells),
      correctPerPass: correct / passes,
      cellsPerPass: cells / passes,
      wrongValue: sum(scores.map((s) => s.wrongValue)),
      missingPlayer: sum(scores.map((s) => s.missingPlayer)),
      nullValue: sum(scores.map((s) => s.nullValue)),
      allPlayersFoundPerPass: scores.filter((s) => s.playersFound === s.playersExpected).length / passes,
      winnerExactPerPass: scores.filter((s) => s.winnerExact).length / passes,
      winningSidePerPass: scores.filter((s) => s.winningSide).length / passes,
      invented: sum(scores.map((s) => s.invented)),
      consistency: consistency(records),
      latencyMeanMs: latencies.length ? sum(latencies) / latencies.length : null,
      latencyP95Ms: percentile(latencies, 95),
      totalTimeMs: sum(records.map((r) => r.latencyMs)),
      inputTokens: sumOrNull(records.map((r) => r.usage.inputTokens)),
      outputTokens: sumOrNull(records.map((r) => r.usage.outputTokens)),
      reasoningTokens: sumOrNull(records.map((r) => r.usage.reasoningTokens)),
      totalCostUsd: totalCost,
      costPerScoreboard,
      weeklyCostUsd: costPerScoreboard === null ? null : costPerScoreboard * WEEKLY_SCOREBOARDS,
    };
  });
}

/** Sibling pairs for H2: [smaller, larger]. */
const SIBLINGS: [string, string][] = [
  ["claude-haiku-5-5", "claude-sonnet-5-5"],
  ["claude-sonnet-5-5", "claude-opus-5-5"],
  ["gpt-6-luna", "gpt-6-sol"],
  ["gemini-2.5-flash", "gemini-3.8-flash"],
];

/**
 * Pre-registered decision thresholds, relative to Azure measured in the same
 * run (or the saved baseline when Azure wasn't re-run): Azure read 367 of 390
 * values (94.1%) on rl-session33 during the harvester validation.
 */
const SAVED_AZURE_ACCURACY = 367 / 390;
/** Within this many percentage points of Azure still qualifies for new games. */
const NEW_GAMES_MARGIN = 0.03;

export function evaluateHypotheses(summaries: MethodSummary[]): string[] {
  const azure = summaries.find((s) => s.method === "azure");
  const llms = summaries.filter((s) => s.method !== "azure" && s.method !== "oracle");
  const lines: string[] = [];
  const verdict = (ok: boolean | null) => (ok === null ? "not testable" : ok ? "supported" : "not supported");
  const fmt = (s: MethodSummary) => `${s.method} ${s.correctPerPass.toFixed(1)}/${s.cellsPerPass}`;

  if (!azure) lines.push("Azure was not run in this experiment, so H1, H3, H4 and H5 have no baseline.");

  const h1 = azure && llms.length ? llms.filter((s) => s.correctPerPass >= azure.correctPerPass - 1) : null;
  lines.push(
    `H1 (an LLM within 1 value of Azure): ${verdict(h1 ? h1.length > 0 : null)}` +
      (h1?.length ? ` — ${h1.map(fmt).join(", ")}` : ""),
  );

  const pairs = SIBLINGS.flatMap(([small, large]) => {
    const a = summaries.find((s) => s.method === small);
    const b = summaries.find((s) => s.method === large);
    return a && b ? [{ small: a, large: b, holds: b.accuracy > a.accuracy }] : [];
  });
  lines.push(
    `H2 (larger sibling more accurate): ${verdict(pairs.length ? pairs.every((p) => p.holds) : null)}` +
      (pairs.length
        ? ` — ${pairs.map((p) => `${p.large.method} ${(p.large.accuracy * 100).toFixed(1)}% vs ${p.small.method} ${(p.small.accuracy * 100).toFixed(1)}%`).join("; ")}`
        : ""),
  );

  const h3 = azure && llms.length ? llms.filter((s) => s.allPlayersFoundPerPass > azure.allPlayersFoundPerPass) : null;
  lines.push(
    `H3 (LLMs find all players more often than Azure, ${azure?.allPlayersFoundPerPass.toFixed(1) ?? "?"} per pass): ${verdict(h3 ? h3.length === llms.length : null)}` +
      (h3 ? ` — ${h3.length}/${llms.length} LLMs` : ""),
  );

  const h4 =
    azure?.costPerScoreboard != null
      ? llms.filter((s) => s.costPerScoreboard !== null && s.costPerScoreboard < azure.costPerScoreboard!)
      : null;
  lines.push(`H4 (every LLM cheaper than Azure per scoreboard): ${verdict(h4 ? h4.length === llms.length : null)}`);

  const h5 =
    azure?.latencyMeanMs != null
      ? llms.filter((s) => s.latencyMeanMs !== null && s.latencyMeanMs > azure.latencyMeanMs!)
      : null;
  lines.push(
    `H5 (LLMs slower than Azure, ${azure?.latencyMeanMs ? (azure.latencyMeanMs / 1000).toFixed(1) + " s" : "?"}): ${verdict(h5 ? h5.length === llms.length : null)}` +
      (h5 ? ` — ${h5.length}/${llms.length} slower` : ""),
  );
  return lines;
}

/** Applies the decision rules fixed in the test plan. */
export function decide(summaries: MethodSummary[]): string {
  const azure = summaries.find((s) => s.method === "azure");
  const baseline = azure?.accuracy ?? SAVED_AZURE_ACCURACY;
  const baselineLabel = azure ? "Azure in this run" : "saved Azure baseline";
  const llms = summaries
    .filter((s) => s.method !== "azure" && s.method !== "oracle")
    .sort((a, b) => b.accuracy - a.accuracy || (a.costPerScoreboard ?? Infinity) - (b.costPerScoreboard ?? Infinity));
  const best = llms[0];
  if (!best) return "No LLM results yet.";
  const vs = `${(best.accuracy * 100).toFixed(1)}% vs ${(baseline * 100).toFixed(1)}% (${baselineLabel})`;
  const cheaper = azure?.costPerScoreboard == null || (best.costPerScoreboard ?? Infinity) < azure.costPerScoreboard;
  if (best.accuracy >= baseline && best.invented === 0 && cheaper)
    return `Pivot candidate: ${best.method}, ${vs}, 0 invented players, cheaper than Azure. Keep Azure as fallback for 4 weekly runs.`;
  if (best.accuracy >= baseline - NEW_GAMES_MARGIN && best.invented === 0)
    return `Use ${best.method} for games without a trained Azure model (${vs}); keep Azure for trained games.`;
  return `Keep Azure. Best LLM was ${best.method}, ${vs}${best.invented ? `, with ${best.invented} invented player(s)` : ""}.`;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const money = (x: number | null, digits = 4) => (x === null ? "n/a" : `$${x.toFixed(digits)}`);
const num = (x: number | null) => (x === null ? "n/a" : Math.round(x).toLocaleString("en-US"));
const secs = (ms: number | null) => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)} s`);

export function writeReport(dataset: Dataset, runDir: string): MethodSummary[] {
  const calls = readCalls(runDir);
  const summaries = summarize(dataset, calls).sort((a, b) => b.accuracy - a.accuracy);
  const meta = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8"));

  const md = [
    `# Extraction benchmark — ${dataset.name}`,
    "",
    `Game: ${dataset.game} · ${dataset.cases.length} scoreboards · ${meta.repeats} repeat(s) · prompt ${meta.promptFingerprint} · prices checked ${PRICES_CHECKED}`,
    "",
    "## Accuracy",
    "",
    "| Method | Correct per pass | Accuracy (95% CI) | Wrong value | Player missing | Left null | All players found / pass | Winner exact / pass | Winning side / pass | Invented | Consistency | Errors | Schema invalid |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...summaries.map(
      (s) =>
        `| ${s.method} | ${s.correctPerPass.toFixed(1)} / ${s.cellsPerPass} | ${pct(s.accuracy)} (${pct(s.ci95[0])}–${pct(s.ci95[1])}) | ${s.wrongValue} | ${s.missingPlayer} | ${s.nullValue} | ${s.allPlayersFoundPerPass.toFixed(1)} / ${dataset.cases.length} | ${s.winnerExactPerPass.toFixed(1)} | ${s.winningSidePerPass.toFixed(1)} | ${s.invented} | ${s.consistency === null ? "n/a" : pct(s.consistency)} | ${s.errors} | ${s.schemaInvalid} |`,
    ),
    "",
    "## Time, tokens, cost",
    "",
    "| Method | Model | Calls | Mean latency | p95 latency | Total time | Input tokens | Output tokens | Reasoning tokens | Total cost | Per scoreboard | Weekly (52) |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...summaries.map(
      (s) =>
        `| ${s.method} | ${s.model} | ${s.calls} | ${secs(s.latencyMeanMs)} | ${secs(s.latencyP95Ms)} | ${secs(s.totalTimeMs)} | ${num(s.inputTokens)} | ${num(s.outputTokens)} | ${num(s.reasoningTokens)} | ${money(s.totalCostUsd)} | ${money(s.costPerScoreboard)} | ${money(s.weeklyCostUsd, 2)} |`,
    ),
    "",
    "## Hypotheses",
    "",
    ...evaluateHypotheses(summaries).map((l) => `- ${l}`),
    "",
    "## Decision (pre-registered rules)",
    "",
    decide(summaries),
    "",
  ].join("\n");

  fs.writeFileSync(path.join(runDir, "results.md"), md);
  fs.writeFileSync(path.join(runDir, "results.json"), JSON.stringify({ meta, summaries }, null, 2));
  writeCsv(
    path.join(runDir, "calls.csv"),
    ["method", "case", "repeat", "started_at", "latency_ms", "input_tokens", "output_tokens", "reasoning_tokens", "cost_usd", "schema_valid", "served_by", "error"],
    calls.map((c) => [c.method, c.caseId, c.repeat, c.startedAt, c.latencyMs, c.usage.inputTokens, c.usage.outputTokens, c.usage.reasoningTokens, c.costUsd, c.schemaValid, c.servedBy, c.error]),
  );
  const cases = new Map(dataset.cases.map((c) => [c.id, c]));
  writeCsv(
    path.join(runDir, "scores.csv"),
    ["method", "case", "repeat", "cells", "correct", "wrong_value", "missing_player", "null_value", "players_expected", "players_found", "invented", "unmapped", "winner_exact", "winning_side", "failed"],
    calls
      .filter((c) => cases.has(c.caseId))
      .map((c) => scoreCall(c, cases.get(c.caseId)!))
      .map((s) => [s.method, s.caseId, s.repeat, s.cells, s.correct, s.wrongValue, s.missingPlayer, s.nullValue, s.playersExpected, s.playersFound, s.invented, s.unmapped, s.winnerExact, s.winningSide, s.failed]),
  );
  console.log(md);
  return summaries;
}

function writeCsv(file: string, header: string[], rows: unknown[][]) {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  fs.writeFileSync(file, [header, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n");
}
