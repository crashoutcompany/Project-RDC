import fs from "fs";
import path from "path";
import type { Player } from "@/generated/prisma/client";
import { VisionResultCodes } from "@/lib/constants";
import { processScoreboard } from "@/lib/vision/analyze-scoreboard";
import { readWithGeminiBatch } from "@/lib/vision/gemini-batch";
import {
  createReaders,
  readerChain,
  readWithFallback,
  type ReaderId,
} from "@/lib/vision/readers";
import type { MatchManifest } from "../types";

/** One video's saved scoreboards, waiting to be read. */
export interface AnalyzeJob {
  matches: MatchManifest[];
  workDir: string;
  gameId: number;
}

/**
 * Reads every saved scoreboard with the chosen reader, falling back down the
 * chain (`gemini` → Azure) when a reader fails. Results go through the same
 * game processors as the admin form.
 *
 * `players` is every known RDC member: the processors map gamertags to members
 * and drop anyone they don't recognize (randoms in public lobbies), so passing
 * the full roster is how we avoid knowing who played up front.
 *
 * With `batch`, Gemini reads all scoreboards across every job in one Batch API
 * submission; anything the batch can't answer is read interactively, chain and
 * all. Results are cached as `match-NN.analysis.json` next to each PNG so
 * reruns don't pay twice.
 */
export async function analyzeJobs(args: {
  jobs: AnalyzeJob[];
  players: Player[];
  reader: ReaderId;
  batch: boolean;
}): Promise<MatchManifest[][]> {
  const { jobs, players } = args;
  const readers = readerChain(
    args.reader,
    createReaders({
      geminiApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      azureEndpoint: process.env.DOCUMENT_INTELLIGENCE_ENDPOINT,
      azureKey: process.env.DOCUMENT_INTELLIGENCE_API_KEY,
    }),
  );

  const cachePathOf = (job: AnalyzeJob, match: MatchManifest) =>
    path.join(job.workDir, match.imagePath.replace(/\.png$/, ".analysis.json"));
  const imageOf = (job: AnalyzeJob, match: MatchManifest) =>
    fs.readFileSync(path.join(job.workDir, match.imagePath)).toString("base64");
  const results = jobs.map((job) =>
    job.matches.map((match): MatchManifest => {
      const cachePath = cachePathOf(job, match);
      if (!fs.existsSync(cachePath)) return match;
      return { ...match, ...JSON.parse(fs.readFileSync(cachePath, "utf8")) };
    }),
  );
  const save = (j: number, m: number, update: Pick<MatchManifest, "analysis" | "reader">) => {
    const match = { ...results[j][m], ...update };
    results[j][m] = match;
    const analysis = match.analysis!;
    const summary =
      analysis.status === VisionResultCodes.Failed
        ? analysis.message
        : `${analysis.data.players.length} RDC players`;
    console.log(
      `[analyze] match ${match.match}: ${analysis.status} via ${match.reader?.id} (${summary})` +
        (match.reader?.fallbacks.length ? ` after ${match.reader.fallbacks.join("; ")}` : ""),
    );
    // Only cache real answers; failures should retry next run.
    if (analysis.status !== VisionResultCodes.Failed)
      fs.writeFileSync(
        cachePathOf(jobs[j], match),
        JSON.stringify({ analysis, reader: match.reader }, null, 2),
      );
  };

  const todo = results.flatMap((matches, j) =>
    matches.flatMap((match, m) => (match.analysis ? [] : [{ j, m }])),
  );
  if (todo.length === 0) return results;

  const batchFailures = new Map<string, string>();
  if (args.batch && args.reader === "gemini") {
    const keyOf = ({ j, m }: { j: number; m: number }) => `${j}:${m}`;
    console.log(`[analyze] batch: ${todo.length} scoreboard(s) → Gemini Batch API`);
    let batched;
    try {
      batched = await readWithGeminiBatch(
        todo.map((t) => ({
          key: keyOf(t),
          gameId: jobs[t.j].gameId,
          base64Source: imageOf(jobs[t.j], jobs[t.j].matches[t.m]),
        })),
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[analyze] batch failed, reading one at a time: ${reason}`);
      batched = new Map(todo.map((t) => [keyOf(t), { error: reason }]));
    }
    for (const t of todo) {
      const r = batched.get(keyOf(t));
      if (!r || !("fields" in r)) {
        batchFailures.set(keyOf(t), r?.error ?? "missing from batch");
        continue;
      }
      const analysis = await withQuietLogs(async () =>
        processScoreboard({
          fields: r.fields,
          gameId: jobs[t.j].gameId,
          sessionPlayers: players,
          ocrCorrections: false,
        }),
      );
      // A Failed result goes down the interactive chain, same as an API error.
      if (analysis.status === VisionResultCodes.Failed) batchFailures.set(keyOf(t), analysis.message);
      else save(t.j, t.m, { analysis, reader: { id: "gemini-batch", fallbacks: [] } });
    }
  }

  for (const t of todo) {
    if (results[t.j][t.m].analysis) continue;
    const job = jobs[t.j];
    const outcome = await withQuietLogs(() =>
      readWithFallback(readers, {
        base64Source: imageOf(job, job.matches[t.m]),
        gameId: job.gameId,
        sessionPlayers: players,
      }),
    );
    const batchFailure = batchFailures.get(`${t.j}:${t.m}`);
    save(t.j, t.m, {
      analysis: outcome.result,
      reader: {
        id: outcome.readerId,
        fallbacks: [
          ...(batchFailure ? [`gemini-batch: ${batchFailure}`] : []),
          ...outcome.fallbacks.map((f) => `${f.from}: ${f.reason}`),
        ],
      },
    });
  }
  return results;
}

/**
 * The game processors log every field they touch and console.error every
 * gamertag they can't map (expected for randoms in public lobbies). That
 * buries the harvester's progress output, so mute the console while one
 * screenshot is processed. Set HARVEST_VERBOSE=1 to see it all.
 */
async function withQuietLogs<T>(fn: () => Promise<T>): Promise<T> {
  if (process.env.HARVEST_VERBOSE) return fn();
  const { log, warn, error } = console;
  console.log = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, warn, error });
  }
}
