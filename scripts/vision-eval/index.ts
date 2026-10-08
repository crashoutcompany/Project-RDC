/**
 * Compares vision providers/models against a small hand-labeled fixture set.
 * Usage: see scripts/vision-eval/README.md
 */
import "dotenv/config";
import { join } from "node:path";
import { loadFixtures } from "./fixtures";
import { runVisionCase } from "./run-case";
import { scoreCase, summarize, type ProviderSummary } from "./metrics";

const DEFAULT_FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const DEFAULT_PROVIDERS = ["azure-di"];

interface Options {
  providers: string[];
  fixturesDir: string;
}

const parseArgs = (argv: string[]): Options => {
  const options: Options = {
    providers: DEFAULT_PROVIDERS,
    fixturesDir: DEFAULT_FIXTURES_DIR,
  };

  for (const arg of argv) {
    if (arg.startsWith("--providers=")) {
      options.providers = arg
        .slice("--providers=".length)
        .split(",")
        .map((spec) => spec.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--fixtures=")) {
      options.fixturesDir = arg.slice("--fixtures=".length);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
};

const printHelp = () => {
  console.log(`Usage: pnpm vision:eval [--providers=<spec>,<spec>...] [--fixtures=<dir>]

  --providers   Comma-separated provider specs (default: azure-di)
                  azure-di
                  llm:google:gemini-2.5-flash
                  llm:azure:<deployment-name>
                  llm:local:<model-id>          (only reachable from pnpm dev)
  --fixtures    Fixtures directory (default: scripts/vision-eval/fixtures)

See scripts/vision-eval/README.md for the fixture format.`);
};

/** Sets VISION_PROVIDER/VISION_MODEL for getVisionProvider() to pick up. */
const applyProviderSpec = (spec: string) => {
  if (spec === "azure-di") {
    process.env.VISION_PROVIDER = "azure-di";
    delete process.env.VISION_MODEL;
    return;
  }
  if (spec.startsWith("llm:")) {
    process.env.VISION_PROVIDER = "llm";
    process.env.VISION_MODEL = spec.slice("llm:".length);
    return;
  }
  throw new Error(
    `Unknown provider spec "${spec}" — use "azure-di" or "llm:<provider>:<model>"`,
  );
};

const formatPct = (n: number) => `${(n * 100).toFixed(0)}%`;
const formatMs = (n: number) => `${Math.round(n)}ms`;

const toReportRow = (summary: ProviderSummary) => ({
  provider: summary.providerSpec,
  cases: summary.cases,
  success: formatPct(summary.successRate),
  checkReq: formatPct(summary.checkRequestRate),
  failed: formatPct(summary.failureRate),
  playerMatch: formatPct(summary.playerMatchRate),
  statMatch: formatPct(summary.statMatchRate),
  winnerAcc: formatPct(summary.winnerAccuracy),
  p50: formatMs(summary.p50Ms),
  p95: formatMs(summary.p95Ms),
});

async function main() {
  const { providers, fixturesDir } = parseArgs(process.argv.slice(2));
  const fixtures = loadFixtures(fixturesDir);

  if (!fixtures.length) {
    console.error(
      `No fixtures found in ${fixturesDir}.\nSee scripts/vision-eval/README.md to add some.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Loaded ${fixtures.length} fixture(s) from ${fixturesDir}\n`);

  const summaries: ProviderSummary[] = [];

  for (const providerSpec of providers) {
    applyProviderSpec(providerSpec);
    console.log(`--- ${providerSpec} ---`);

    const metrics = [];
    for (const fixture of fixtures) {
      const result = await runVisionCase(
        fixture.imageBase64,
        fixture.gameId,
        fixture.sessionPlayers,
      );
      const metric = scoreCase(fixture.id, fixture.expected, result);
      metrics.push(metric);

      const statLabel = metric.statTotal
        ? formatPct(metric.statMatches / metric.statTotal)
        : "n/a";
      console.log(
        `  ${fixture.id}: ${metric.status}` +
          (result.message ? ` (${result.message})` : "") +
          ` — players ${formatPct(metric.playerMatchRate)}, stats ${statLabel}, winner ${
            metric.winnerCorrect ? "✓" : "✗"
          }, ${formatMs(metric.durationMs)}`,
      );
    }

    summaries.push(summarize(providerSpec, metrics));
    console.log();
  }

  console.log("=== Summary ===");
  console.table(summaries.map(toReportRow));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
