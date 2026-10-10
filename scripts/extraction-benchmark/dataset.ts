import fs from "fs";
import path from "path";
import prisma from "prisma/db";
import type { StatName } from "@/lib/stat-names";
import type { AnalysisResults } from "@/lib/visionTypes";
import { VisionResultCodes } from "@/lib/constants";
import { checkDeps } from "../scoreboard-harvester/pipeline/deps";
import { OcrWorkerPool } from "../scoreboard-harvester/pipeline/ocr";
import { resolveGame, screenStatConfigs } from "./games";
import type { Dataset, DatasetCase, ExpectedScoreboard } from "./types";

type GroundTruth = Map<number, ExpectedScoreboard>;

async function loadGroundTruth(sessionId: number, statNames: StatName[]) {
  const session = await prisma.session.findUnique({
    where: { sessionId },
    include: {
      sets: {
        orderBy: { setId: "asc" },
        include: {
          matches: {
            orderBy: { matchId: "asc" },
            include: {
              matchWinners: true,
              playerSessions: {
                include: { player: true, playerStats: { include: { gameStat: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const matches: GroundTruth = new Map();
  for (const set of session.sets)
    for (const match of set.matches)
      matches.set(match.matchId, {
        players: match.playerSessions.map((ps) => ({
          playerId: ps.player.playerId,
          name: ps.player.playerName,
          stats: Object.fromEntries(
            ps.playerStats
              .filter((st) => statNames.includes(st.gameStat.statName as StatName))
              .map((st) => [st.gameStat.statName, st.value]),
          ),
        })),
        winnerIds: match.matchWinners.map((p) => p.playerId),
      });
  return { videoId: session.videoId, matches };
}

/** Values two readings of the same scoreboard agree on. */
function overlap(expected: ExpectedScoreboard, analysis: AnalysisResults): number {
  if (analysis.status === VisionResultCodes.Failed) return 0;
  let n = 0;
  for (const player of expected.players) {
    const row = analysis.data.players.find((p) => p.playerId === player.playerId);
    if (!row) continue;
    for (const s of row.stats)
      if (player.stats[s.stat as StatName] === s.statValue) n++;
  }
  return n;
}

const timestampFromName = (file: string) => {
  const m = file.match(/t=(\d{2})-(\d{2})-(\d{2})/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined;
};

/**
 * Freezes a dataset: copies the scoreboard images into the benchmark dir and
 * stores the database's answer for each one, so every run reads identical
 * inputs even if the database is edited later.
 *
 * Images are paired with database matches either explicitly (`map`, e.g.
 * { "match-01": 585 }) or by best agreement with saved Azure readings
 * (`*.analysis.json` from the harvester). The second is convenient but uses
 * Azure's own output to pair, so check the printed agreement and pass `map`
 * for any pair that looks weak.
 */
export async function buildDataset(args: {
  name: string;
  game: string;
  sessionId: number;
  imagesDir: string;
  outDir: string;
  map?: Record<string, number>;
}): Promise<Dataset> {
  const spec = resolveGame(args.game);
  const statNames = screenStatConfigs(spec).map((c) => c.name);
  const { videoId, matches } = await loadGroundTruth(args.sessionId, statNames);
  await prisma.$disconnect();

  const images = fs.readdirSync(args.imagesDir).filter((f) => f.endsWith(".png")).sort();
  if (images.length === 0) throw new Error(`No PNGs in ${args.imagesDir}`);
  const datasetDir = path.join(args.outDir, args.name);
  fs.mkdirSync(datasetDir, { recursive: true });

  const used = new Set<number>();
  const cases: DatasetCase[] = [];
  for (const file of images) {
    const id = file.match(/^(match-\d+)/)?.[1] ?? path.basename(file, ".png");
    let matchId = args.map?.[id];
    let agreement: number | null = null;

    if (matchId === undefined) {
      const analysisPath = path.join(args.imagesDir, file.replace(/\.png$/, ".analysis.json"));
      if (!fs.existsSync(analysisPath))
        throw new Error(`${id}: no --map entry and no ${path.basename(analysisPath)} to pair with`);
      const analysis = JSON.parse(fs.readFileSync(analysisPath, "utf8")) as AnalysisResults;
      const ranked = [...matches.entries()]
        .filter(([mid]) => !used.has(mid))
        .map(([mid, gt]) => ({ mid, score: overlap(gt, analysis) }))
        .sort((a, b) => b.score - a.score);
      matchId = ranked[0]?.mid;
      agreement = ranked[0]?.score ?? 0;
    }
    const expected = matchId !== undefined ? matches.get(matchId) : undefined;
    if (matchId === undefined || !expected) throw new Error(`${id}: no database match to pair with`);
    used.add(matchId);

    const image = path.join(datasetDir, file);
    fs.copyFileSync(path.join(args.imagesDir, file), image);
    cases.push({ id, image, matchId, timestampSec: timestampFromName(file), expected });
    console.log(
      `[dataset] ${id} → match ${matchId}` +
        (agreement === null ? " (explicit)" : ` (agreed on ${agreement} values)`),
    );
  }

  const dataset: Dataset = {
    name: args.name,
    game: spec.id,
    source: { sessionId: args.sessionId, videoId, recordedMatches: matches.size },
    pairing: args.map
      ? "explicit image→match map"
      : "best agreement with saved Azure readings (see build log)",
    cases,
  };
  fs.writeFileSync(path.join(datasetDir, "dataset.json"), JSON.stringify(dataset, null, 2));
  console.log(`[dataset] ${cases.length} cases → ${path.join(datasetDir, "dataset.json")}`);
  return dataset;
}

export function loadDataset(file: string): Dataset {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Dataset;
}

/** Numbers on the screen, as a multiset. */
function digitTokens(lines: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of lines)
    for (const t of line.match(/\d+/g) ?? []) out.set(String(Number(t)), (out.get(String(Number(t))) ?? 0) + 1);
  return out;
}

/**
 * How many of a match's recorded values appear on the screen. Only values of
 * 10 or more count: small numbers appear on every scoreboard and don't tell
 * matches apart. Each screen number is used once.
 */
function screenAgreement(expected: ExpectedScoreboard, tokens: Map<string, number>): number {
  const left = new Map(tokens);
  let n = 0;
  for (const player of expected.players)
    for (const value of Object.values(player.stats)) {
      if (value === undefined || !/^\d+$/.test(value) || Number(value) < 10) continue;
      const key = String(Number(value));
      const count = left.get(key) ?? 0;
      if (count === 0) continue;
      left.set(key, count - 1);
      n++;
    }
  return n;
}

/** Below this many agreeing values, or this close to the runner-up, a pair is refused. */
const MIN_AGREEMENT = 4;
const MIN_MARGIN = 2;

/**
 * Pairs collected scoreboard images with the session's database matches by
 * the numbers RapidOCR reads on screen. Match IDs aren't in play order (the
 * admin insert runs in parallel), so order can't be used, and pairing with a
 * method under test would be circular. Pairs are assigned best-first, one
 * match per image. Refuses when the counts differ or any pair is weak or
 * ambiguous, rather than guessing.
 */
export async function datasetFromCollection(args: {
  name: string;
  game: string;
  sessionId: number;
  collectionFile: string;
  outDir: string;
}): Promise<Dataset> {
  const spec = resolveGame(args.game);
  const statNames = screenStatConfigs(spec).map((c) => c.name);
  const { videoId, matches } = await loadGroundTruth(args.sessionId, statNames);
  await prisma.$disconnect();

  const collection = JSON.parse(fs.readFileSync(args.collectionFile, "utf8")) as {
    detections: { index: number; imagePath: string; frameSec: number }[];
  };
  if (collection.detections.length !== matches.size)
    throw new Error(
      `${args.name}: ${collection.detections.length} scoreboards found but ${matches.size} matches in the database; not pairing`,
    );

  const deps = checkDeps(path.resolve(import.meta.dirname, "../scoreboard-harvester"), false, "rapidocr");
  if (!deps.ocrEngine) throw new Error(deps.errors.join("\n"));
  const pool = new OcrWorkerPool(deps.ocrEngine, 2);
  const screens = await Promise.all(
    collection.detections.map(async (d) => digitTokens(await pool.recognize(d.imagePath))),
  ).finally(() => pool.close());

  // Every (image, match) score, then greedy best-first so one strong pair can't be stolen by a weaker one.
  const scores = collection.detections.flatMap((d, i) =>
    [...matches.entries()].map(([matchId, gt]) => ({ i, matchId, score: screenAgreement(gt, screens[i]) })),
  );
  const pairs = new Map<number, { matchId: number; score: number; runnerUp: number }>();
  const usedMatches = new Set<number>();
  for (const s of [...scores].sort((a, b) => b.score - a.score)) {
    if (pairs.has(s.i) || usedMatches.has(s.matchId)) continue;
    const runnerUp = Math.max(
      0,
      ...scores.filter((o) => o.i === s.i && o.matchId !== s.matchId).map((o) => o.score),
    );
    pairs.set(s.i, { matchId: s.matchId, score: s.score, runnerUp });
    usedMatches.add(s.matchId);
  }

  const problems: string[] = [];
  for (const [i, d] of collection.detections.entries()) {
    const p = pairs.get(i)!;
    const ok = p.score >= MIN_AGREEMENT && p.score - p.runnerUp >= MIN_MARGIN;
    console.log(
      `[dataset] match-${String(d.index).padStart(2, "0")} → match ${p.matchId} (${p.score} values on screen, runner-up ${p.runnerUp})${ok ? "" : "  ← weak"}`,
    );
    if (!ok) problems.push(`match-${d.index}`);
  }
  if (problems.length) throw new Error(`${args.name}: weak or ambiguous pairs: ${problems.join(", ")}; not pairing`);

  const datasetDir = path.join(args.outDir, args.name);
  fs.rmSync(datasetDir, { recursive: true, force: true });
  fs.mkdirSync(datasetDir, { recursive: true });
  const cases: DatasetCase[] = collection.detections.map((d, i) => {
    const { matchId } = pairs.get(i)!;
    const id = `match-${String(d.index).padStart(2, "0")}`;
    const image = path.join(datasetDir, `${id}.png`);
    fs.copyFileSync(d.imagePath, image);
    return { id, image, matchId, timestampSec: Math.round(d.frameSec), expected: matches.get(matchId)! };
  });

  const dataset: Dataset = {
    name: args.name,
    game: spec.id,
    source: { sessionId: args.sessionId, videoId, recordedMatches: matches.size },
    pairing: `screen numbers read by RapidOCR, best-first; every pair ≥ ${MIN_AGREEMENT} values and ${MIN_MARGIN} ahead of the runner-up`,
    cases,
  };
  fs.writeFileSync(path.join(datasetDir, "dataset.json"), JSON.stringify(dataset, null, 2));
  console.log(`[dataset] ${cases.length} cases → ${path.join(datasetDir, "dataset.json")}`);
  return dataset;
}
