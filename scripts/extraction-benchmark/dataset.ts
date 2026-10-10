import fs from "fs";
import path from "path";
import prisma from "prisma/db";
import type { StatName } from "@/lib/stat-names";
import type { AnalysisResults } from "@/lib/visionTypes";
import { VisionResultCodes } from "@/lib/constants";
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

/**
 * Pairs collected scoreboard images with the session's database matches by
 * play order (set, then match). Refuses to pair when the counts differ: a
 * wrong count means the detector is wrong, and pairing would hide that.
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
  const ordered = [...matches.entries()];
  if (collection.detections.length !== ordered.length)
    throw new Error(
      `${args.name}: ${collection.detections.length} scoreboards found but ${ordered.length} matches in the database; not pairing`,
    );

  const datasetDir = path.join(args.outDir, args.name);
  fs.mkdirSync(datasetDir, { recursive: true });
  const cases: DatasetCase[] = collection.detections.map((d, i) => {
    const [matchId, expected] = ordered[i];
    const id = `match-${String(d.index).padStart(2, "0")}`;
    const image = path.join(datasetDir, `${id}.png`);
    fs.copyFileSync(d.imagePath, image);
    return { id, image, matchId, timestampSec: Math.round(d.frameSec), expected };
  });

  const dataset: Dataset = {
    name: args.name,
    game: spec.id,
    source: { sessionId: args.sessionId, videoId, recordedMatches: matches.size },
    pairing: "play order: scoreboard n ↔ n-th match by set and match id; counts equal",
    cases,
  };
  fs.writeFileSync(path.join(datasetDir, "dataset.json"), JSON.stringify(dataset, null, 2));
  console.log(`[dataset] ${cases.length} cases → ${path.join(datasetDir, "dataset.json")}`);
  return dataset;
}
