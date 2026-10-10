import fs from "fs";
import os from "os";
import path from "path";
import { BENCH_DIR } from "./config";
import { resolveGame } from "./games";
import { buildPrompt, buildSchema, SYSTEM_PROMPT } from "./prompt";
import { loadDataset } from "./dataset";
import { z } from "zod";

/**
 * Blind reading for Claude subagents. Run through index.ts (`prepare`, `ingest`). A subagent gets only neutral image names
 * and the instructions, never the dataset file or the database. The key that
 * maps neutral names to cases is kept outside the experiment folder so a
 * subagent with file access can't stumble on it.
 *
 *   prepare --dataset <dataset.json>   build blind images, key and brief
 *   ingest  --dataset <dataset.json> --model <haiku|sonnet|opus>
 *                                      copy a subagent's answers into the run
 */

const PRIVATE_DIR = path.join(os.homedir(), "ocrbench", "private");

const blindDir = (game: string) => path.join(BENCH_DIR, "blind", game);
const outDir = (model: string, game: string) => path.join(BENCH_DIR, "blind", "out", model, game);
const keyFile = (game: string) => path.join(PRIVATE_DIR, `key-${game}.json`);

export function prepare(datasetFile: string) {
  const dataset = loadDataset(datasetFile);
  const spec = resolveGame(dataset.game);
  const dir = blindDir(spec.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });

  // Neutral names, shuffled so file order doesn't reveal match order.
  const order = dataset.cases.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const key: Record<string, string> = {};
  order.forEach((caseIndex, n) => {
    const neutral = `s${String(n + 1).padStart(2, "0")}`;
    const testCase = dataset.cases[caseIndex];
    key[neutral] = testCase.id;
    fs.copyFileSync(testCase.image, path.join(dir, `${neutral}.png`));
  });
  fs.writeFileSync(keyFile(spec.id), JSON.stringify(key, null, 2));

  const schema = JSON.stringify(z.toJSONSchema(buildSchema(spec)), null, 2);
  fs.writeFileSync(
    path.join(dir, "BRIEF.md"),
    [
      "# Scoreboard reading task",
      "",
      "Read every PNG in this folder, one at a time, and write one JSON file per image.",
      "",
      `Images: ${Object.keys(key).map((n) => `${n}.png`).join(", ")}`,
      "",
      "Use only these images. Do not open any other file, folder, or database, and do not search the repository.",
      "",
      "## Instructions",
      "",
      "```",
      SYSTEM_PROMPT,
      "```",
      "",
      "```",
      buildPrompt(spec),
      "```",
      "",
      "## Output",
      "",
      `For each image, write \`${outDir("<model>", spec.id)}/<name>.json\` (for example \`s01.json\`) with this JSON shape:`,
      "",
      "```json",
      schema,
      "```",
      "",
      "Write only the JSON, with no commentary. Use null for anything you cannot read.",
      "Then reply with a single line: `done <number of files written>`.",
      "",
    ].join("\n"),
  );
  console.log(`[blind] ${order.length} images → ${dir}`);
  console.log(`[blind] brief → ${path.join(dir, "BRIEF.md")}`);
  console.log(`[blind] key kept at ${keyFile(spec.id)} (do not share with readers)`);
}

export function ingest(datasetFile: string, model: string) {
  const dataset = loadDataset(datasetFile);
  const spec = resolveGame(dataset.game);
  const key = JSON.parse(fs.readFileSync(keyFile(spec.id), "utf8")) as Record<string, string>;
  const source = outDir(model, spec.id);
  const target = path.join(BENCH_DIR, "claude", model, spec.id);
  fs.mkdirSync(target, { recursive: true });

  const usageFile = path.join(BENCH_DIR, "blind", "out", "usage.jsonl");
  const usage = new Map<string, { tokens: number; ms: number }>();
  if (fs.existsSync(usageFile))
    for (const line of fs.readFileSync(usageFile, "utf8").split("\n").filter(Boolean)) {
      const row = JSON.parse(line) as { model: string; game: string; id: string; tokens: number; ms: number };
      usage.set(`${row.model}|${row.game}|${row.id}`, { tokens: row.tokens, ms: row.ms });
    }

  let copied = 0;
  for (const [neutral, caseId] of Object.entries(key)) {
    const file = path.join(source, `${neutral}.json`);
    if (!fs.existsSync(file)) {
      console.warn(`[ingest] ${model}: no answer for ${neutral} (${caseId})`);
      continue;
    }
    const answer = JSON.parse(fs.readFileSync(file, "utf8"));
    const used = usage.get(`${model}|${spec.id}|${neutral}`);
    fs.writeFileSync(
      path.join(target, `${caseId}.json`),
      JSON.stringify(used ? { ...answer, _usage: used } : answer, null, 2),
    );
    copied++;
  }
  console.log(`[ingest] ${model} ${spec.id}: ${copied}/${Object.keys(key).length} → ${target}`);
}
