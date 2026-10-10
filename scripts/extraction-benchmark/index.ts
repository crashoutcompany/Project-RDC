#!/usr/bin/env tsx
/**
 * Scoreboard extraction benchmark. See README.md and ~/ocrbench/test-plan.md.
 *
 *   pnpm bench -- dataset --name rl-s33 --game rocket-league --session 33 --images <dir>
 *   pnpm bench -- run     --dataset <dataset.json> [--methods a,b] [--repeats 3]
 *   pnpm bench -- report  --dataset <dataset.json> --run <name>
 *   pnpm bench -- finder  --dataset <dataset.json> --video <url|path>
 *   pnpm bench -- combine --run rl-run,mk8-run
 *   pnpm bench -- methods
 */
import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { BENCH_DIR, DEFAULT_REPEATS, METHODS, PRICES_CHECKED, resolveMethods } from "./config";
import { buildDataset, loadDataset } from "./dataset";
import { runFinder } from "./finder";
import { writeCombined, writeReport } from "./report";
import { runExtraction } from "./run";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    game: { type: "string" },
    session: { type: "string" },
    images: { type: "string" },
    map: { type: "string" },
    dataset: { type: "string" },
    methods: { type: "string" },
    repeats: { type: "string" },
    run: { type: "string" },
    "retry-failed": { type: "boolean", default: false },
    video: { type: "string" },
    model: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

const command = positionals[0];
const list = (raw: string | undefined) => raw?.split(",").map((s) => s.trim()).filter(Boolean);
const need = (value: string | undefined, flag: string) => {
  if (!value) throw new Error(`--${flag} is required`);
  return value;
};
const datasetPath = () => path.resolve(need(values.dataset, "dataset"));
const runDir = (datasetName: string) =>
  path.join(BENCH_DIR, "runs", values.run ?? `${datasetName}-${new Date().toISOString().slice(0, 10)}`);

async function main() {
  if (values.help || !command) {
    console.log(`Commands: dataset, run, report, combine, finder, methods. See scripts/extraction-benchmark/README.md`);
    return;
  }

  if (command === "methods") {
    console.log(`Prices checked ${PRICES_CHECKED}\n`);
    for (const m of METHODS) {
      const missing = m.env.filter((name) => !process.env[name]);
      const price =
        m.price.kind === "tokens"
          ? `$${m.price.inputPerM} / $${m.price.outputPerM} per 1M`
          : m.price.kind === "call"
            ? `$${m.price.perCall} per call`
            : m.price.kind === "subscription"
              ? "plan usage (not per call)"
              : "free";
      console.log(`${m.id.padEnd(20)} ${m.provider.padEnd(10)} ${price.padEnd(26)} ${missing.length ? `missing ${missing.join(", ")}` : "ready"}`);
    }
    return;
  }

  if (command === "prepare" || command === "ingest") {
    const { prepare, ingest } = await import("./blind");
    if (command === "prepare") prepare(datasetPath());
    else ingest(datasetPath(), need(values.model, "model"));
    return;
  }

  if (command === "dataset") {
    const map = list(values.map)?.reduce<Record<string, number>>((acc, pair) => {
      const [id, matchId] = pair.split("=");
      acc[id] = Number(matchId);
      return acc;
    }, {});
    await buildDataset({
      name: need(values.name, "name"),
      game: need(values.game, "game"),
      sessionId: Number(need(values.session, "session")),
      imagesDir: path.resolve(need(values.images, "images")),
      outDir: path.join(BENCH_DIR, "datasets"),
      map,
    });
    return;
  }

  if (command === "combine") {
    const runs = need(values.run, "run").split(",").map((name) => {
      const dir = path.join(BENCH_DIR, "runs", name.trim());
      const meta = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8"));
      return { runDir: dir, dataset: loadDataset(path.join(BENCH_DIR, "datasets", meta.dataset, "dataset.json")) };
    });
    writeCombined(runs, path.join(BENCH_DIR, "runs", "combined.md"));
    return;
  }

  const dataset = loadDataset(datasetPath());

  if (command === "run") {
    const dir = runDir(dataset.name);
    await runExtraction({
      dataset,
      methods: resolveMethods(list(values.methods)),
      repeats: values.repeats ? Number(values.repeats) : DEFAULT_REPEATS,
      runDir: dir,
      retryFailed: Boolean(values["retry-failed"]),
    });
    writeReport(dataset, dir);
    console.log(`\n[bench] results → ${dir}`);
    return;
  }

  if (command === "report") {
    writeReport(dataset, runDir(dataset.name));
    return;
  }

  if (command === "finder") {
    const methods = (list(values.methods) ?? ["rapidocr", "decisions"]) as ("decisions" | "rapidocr")[];
    await runFinder({
      dataset,
      video: need(values.video, "video"),
      methods,
      outDir: path.join(BENCH_DIR, "finder", dataset.name),
    });
    return;
  }

  throw new Error(`Unknown command "${command}"`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[bench]", err instanceof Error ? err.message : err);
    process.exit(1);
  });
