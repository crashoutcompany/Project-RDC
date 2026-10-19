import fs from "fs";
import path from "path";
import OpenAI from "openai";
import sharp from "sharp";
import type { Player } from "@/generated/prisma/client";
import { VisionResultCodes } from "@/lib/constants";
import { GAMES } from "@/lib/vision/scoreboard-specs";
import type { AnalysisResults, VisionPlayer } from "@/lib/visionTypes";
import { createReaders, readerChain, readWithFallback, type ReadOutcome } from "@/lib/vision/readers";
import type { MatchManifest, OcrRecord } from "../types";
import { askPredicates, type PredicateQuestion } from "./decisions";
import { withQuietLogs } from "./quiet";
import { sampleFrames } from "./sample";

export interface LocateArgs {
  videoPath: string;
  workDir: string;
  ffmpegPath: string;
  durationSec: number;
  players: Player[];
  gameId: number;
  concurrency: number;
}

const PANEL_TH = 0.4;
const TH = 0.5;
const CLUSTER_GAP = 20;
const PRE = 15;
const POST = 15;
const STRIDE = 3;
const ASK_WIDTH = 640;
const READ_WIDTH = 1280;
/** Largest RDC lobby. The scan stops once a read has this many clean places. */
const FULL_LOBBY = 5;

const RACING =
  "Is this live Mario Kart 8 race gameplay: a kart driving on a track with the race HUD? Answer no for menus, results panels, and black or loading screens.";
const POINTS =
  "Is Mario Kart 8's results list on screen with points being added on the rows, shown as '+' numbers like +6 or +4? It may be drawn over the race track.";

const QUESTIONS = {
  panel: { name: "panel", instructions: GAMES["mario-kart-8"].finderQuestion },
  racing: { name: "racing", instructions: RACING },
  points: { name: "points", instructions: POINTS },
} as const;

export interface SampleScore {
  t: number;
  panel: number;
  racing: number;
}

/** Racing ended and no results list was already found nearby. */
export function safetyWindows(
  samples: SampleScore[],
  hits: number[],
): [number, number][] {
  const windows: [number, number][] = [];
  for (let i = 1; i < samples.length; i++) {
    const [a, b] = [samples[i - 1], samples[i]];
    if (!(a.racing >= TH && b.racing < TH)) continue;
    const lo = Math.round(a.t) - PRE;
    const hi = Math.round(b.t) + POST;
    if (!hits.some((t) => t >= lo && t <= hi)) windows.push([lo, hi]);
  }
  return windows;
}

export function clusterTimes(times: number[], gap = CLUSTER_GAP): number[][] {
  const clusters: number[][] = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    const current = clusters.at(-1);
    if (current && t - current.at(-1)! <= gap) current.push(t);
    else clusters.push([t]);
  }
  return clusters;
}

export function cleanOrder(placed: Record<number, string>): boolean {
  const values = Object.values(placed);
  return values.length >= 2 && new Set(values).size === values.length && values.every((v) => /^[1-9]\d*$/.test(v));
}

/**
 * One missing place and one unused place: the hidden row took it. `lobbyIds`
 * is who raced, so a four-player night does not gain a fifth.
 */
export function fillPlaces(
  placed: Record<number, string>,
  lobbyIds: number[],
): { placed: Record<number, string>; filled: boolean } {
  const ids = Object.keys(placed).map(Number);
  const bad = ids.filter((id) => !/^[1-9]\d*$/.test(placed[id]));
  const used = new Set(ids.filter((id) => !bad.includes(id)).map((id) => placed[id]));
  const freeAmong = (n: number) =>
    Array.from({ length: n }, (_, i) => String(i + 1)).filter((p) => !used.has(p));
  if (bad.length === 1 && freeAmong(ids.length).length === 1) {
    const place = freeAmong(ids.length)[0];
    return { placed: { ...placed, [bad[0]]: place }, filled: true };
  }
  if (bad.length === 0 && ids.length === lobbyIds.length - 1) {
    const missing = lobbyIds.filter((id) => placed[id] === undefined);
    const free = freeAmong(lobbyIds.length);
    if (missing.length === 1 && free.length === 1)
      return { placed: { ...placed, [missing[0]]: free[0] }, filled: true };
  }
  return { placed, filled: false };
}

/** The roster that shows up most often. Ties go to the larger roster. */
export function inferLobby(reads: Record<number, string>[]): number[] {
  const counts = new Map<string, number>();
  for (const read of reads) {
    const ids = Object.keys(read)
      .map(Number)
      .filter((id) => /^[1-9]\d*$/.test(read[id]))
      .sort((a, b) => a - b);
    if (ids.length < 2) continue;
    const key = ids.join(",");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = "";
  let n = 0;
  for (const [key, count] of counts) {
    const longer = key.split(",").length > (best ? best.split(",").length : 0);
    if (count > n || (count === n && longer)) {
      best = key;
      n = count;
    }
  }
  return best ? best.split(",").map(Number) : [];
}

/**
 * Newest frame on a `stride` grid that passes `hit`. Only `concurrency` checks
 * run at once, and frames older than a hit are not asked.
 */
export async function newestHit<T>(
  frames: T[],
  stride: number,
  concurrency: number,
  hit: (frame: T) => Promise<boolean>,
): Promise<T | null> {
  if (frames.length === 0 || stride < 1) return null;
  const candidates: T[] = [];
  for (let k = frames.length - 1; k >= 0; k -= stride) candidates.push(frames[k]);

  const width = Math.max(1, concurrency);
  let next = 0;
  let inFlight = 0;
  let foundAt = -1;
  let settledCount = 0;
  const settled = new Set<number>();
  let done = false;

  return new Promise((resolve, reject) => {
    const finish = (value: T | null) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const fail = (err: unknown) => {
      if (done) return;
      done = true;
      reject(err);
    };
    const consider = () => {
      if (done) return;
      if (foundAt === -1) {
        if (settledCount === candidates.length) finish(null);
        return;
      }
      for (let i = 0; i < foundAt; i++) if (!settled.has(i)) return;
      finish(candidates[foundAt]);
    };
    const launch = () => {
      while (!done && foundAt === -1 && inFlight < width && next < candidates.length) {
        const index = next++;
        inFlight++;
        void Promise.resolve(candidates[index])
          .then((frame) => hit(frame))
          .then(
            (ok) => {
              inFlight--;
              settled.add(index);
              settledCount++;
              if (ok && (foundAt === -1 || index < foundAt)) foundAt = index;
              consider();
              launch();
            },
            (err) => fail(err),
          );
      }
    };
    launch();
  });
}

type Ans = Record<string, number>;

/**
 * Finds one results frame per race. The frame is already read: a later trophy
 * screen can outscore the list, so the latest "+points" frame is not always
 * the one that is kept.
 */
export async function locateMarioKart(args: LocateArgs): Promise<OcrRecord[]> {
  const { videoPath, workDir, ffmpegPath, durationSec, players, gameId, concurrency } = args;
  const framesDir = path.join(workDir, "frames");
  const client = new OpenAI({ maxRetries: 0 });
  const cache = loadCache(path.join(workDir, "decisions.jsonl"));
  const reads = loadReads(path.join(workDir, "reads.jsonl"));

  const keyframes = await sampleFrames({
    ffmpegPath,
    videoPath,
    framesDir: path.join(framesDir, "kf"),
    fps: 1,
    mode: "keyframes",
    sampleWidth: ASK_WIDTH,
    jpegQuality: 3,
    durationSec,
  });
  const keyAnswers = await mapPool(keyframes, concurrency, (frame) =>
    ask(client, cache, frame.filePath, [QUESTIONS.panel, QUESTIONS.racing], false),
  );
  const samples: SampleScore[] = keyframes.map((frame, i) => ({
    t: frame.timestampSec,
    panel: keyAnswers[i].panel,
    racing: keyAnswers[i].racing,
  }));
  const hits = samples.filter((s) => s.panel >= PANEL_TH).map((s) => s.t);
  const kfHits = new Set(hits);
  const windows = safetyWindows(samples, hits);
  const safetyHits: number[] = [];
  await mapPool(windows, Math.min(4, concurrency), async ([lo, hi]) => {
    const frames = await decode(args, lo, hi - lo + 1, path.join(framesDir, `safety-${lo}`), ASK_WIDTH);
    const hit = await newestHit(frames, STRIDE, 1, async (frame) => {
      const answer = await ask(client, cache, frame.file, [QUESTIONS.panel], false);
      return answer.panel >= TH;
    });
    if (hit) safetyHits.push(hit.t);
  });

  const readers = readerChain(
    "gemini",
    createReaders({
      geminiApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      azureEndpoint: process.env.DOCUMENT_INTELLIGENCE_ENDPOINT,
      azureKey: process.env.DOCUMENT_INTELLIGENCE_API_KEY,
    }),
  );
  const chosen: OcrRecord[] = [];
  const clusters = clusterTimes([...hits, ...safetyHits]);
  await mapPool(clusters, Math.min(4, concurrency), async (cluster) => {
    const frame = await refineCluster({
      args,
      cluster,
      framesDir,
      client,
      cache,
      reads,
      readers,
      players,
      gameId,
      concurrency,
      fromSafety: cluster.every((t) => !kfHits.has(t)),
    });
    if (frame) chosen.push(frame);
  });
  chosen.sort((a, b) => a.timestampSec - b.timestampSec);
  console.log(
    `[mario-kart] keyframes ${keyframes.length}, panel hits ${hits.length}, safety windows ${windows.length}, races ${chosen.length}`,
  );
  return chosen.map((frame, i) => ({ ...frame, frameId: i + 1 }));
}

/** Fills a single hidden place from the roster that the reads agree on. */
export function refineMarioKartReads(matches: MatchManifest[], players: Player[]): MatchManifest[] {
  const reads = matches.flatMap((match) => {
    const placed = placesOf(match);
    return placed ? [placed] : [];
  });
  const lobby = inferLobby(reads);
  if (lobby.length < 2) return matches;
  return matches.map((match) => applyFill(match, lobby, players));
}

async function refineCluster(ctx: {
  args: LocateArgs;
  cluster: number[];
  framesDir: string;
  client: OpenAI;
  cache: DecisionCache;
  reads: ReadCache;
  readers: ReturnType<typeof readerChain>;
  players: Player[];
  gameId: number;
  concurrency: number;
  fromSafety: boolean;
  allowBackSearch?: boolean;
}): Promise<OcrRecord | null> {
  const allowBackSearch = ctx.allowBackSearch ?? true;
  const lo = Math.round(ctx.cluster[0]) - 6;
  const hi = Math.round(ctx.cluster.at(-1)!) + 2;
  const frames = await decode(ctx.args, lo, hi - lo + 1, path.join(ctx.framesDir, `refine-${lo}`), READ_WIDTH);
  const points = await mapPool(frames, ctx.concurrency, (frame) =>
    ask(ctx.client, ctx.cache, frame.file, [QUESTIONS.points], true),
  );
  const order = frames
    .map((frame, i) => ({ ...frame, p: points[i].points }))
    .filter((frame) => frame.p >= TH)
    .sort((a, b) => b.t - a.t);
  if (order.length === 0) {
    if (!allowBackSearch) return null;
    const from = Math.round(ctx.cluster[0]) - 8;
    const to = Math.round(ctx.cluster[0]) - 68;
    const back = await decode(ctx.args, to, from - to + 1, path.join(ctx.framesDir, `back-${to}`), ASK_WIDTH);
    const hit = await newestHit(back, STRIDE, ctx.concurrency, async (frame) => {
      const answer = await ask(ctx.client, ctx.cache, frame.file, [QUESTIONS.panel], false);
      return answer.panel >= TH;
    });
    if (hit) return refineCluster({ ...ctx, cluster: [hit.t], allowBackSearch: false });
    return null;
  }

  let best: OcrRecord | null = null;
  let bestCount = 0;
  let bestClean = false;
  for (const frame of order.slice(0, 6)) {
    const outcome = await readFrame(ctx, frame.file);
    const placed = placesFromAnalysis(outcome.result);
    const clean = cleanOrder(placed);
    const count = Object.keys(placed).length;
    const better =
      !best ||
      (clean && count > bestCount) ||
      (!bestClean && clean);
    if (better) {
      best = {
        frameId: 0,
        filePath: frame.file,
        timestampSec: frame.t,
        text: [],
        matchedKeywords: [`points p=${frame.p.toFixed(2)}`],
        preread: {
          analysis: outcome.result,
          readerId: outcome.readerId,
          fallbacks: outcome.fallbacks.map((f) => `${f.from}: ${f.reason}`),
        },
      };
      bestCount = count;
      bestClean = clean;
    }
    if (clean && count >= FULL_LOBBY) break;
  }
  if (!best || !bestClean) return null;
  if (ctx.fromSafety) best.matchedKeywords.push("safety");
  return best;
}

function applyFill(match: MatchManifest, lobby: number[], players: Player[]): MatchManifest {
  const analysis = match.analysis;
  if (!analysis || analysis.status === VisionResultCodes.Failed) return match;
  if (analysis.message.includes("inferred")) return match;
  const placed = placesFromAnalysis(analysis);
  const filled = fillPlaces(placed, lobby);
  if (!filled.filled) return match;

  const nextPlayers: VisionPlayer[] = analysis.data.players.map((player) => {
    if (typeof player.playerId !== "number") return player;
    const place = filled.placed[player.playerId];
    if (!place || place === placed[player.playerId]) return player;
    return {
      ...player,
      stats: player.stats.map((stat) => (stat.stat === "MK8_POS" ? { ...stat, statValue: place } : stat)),
    };
  });
  for (const [id, place] of Object.entries(filled.placed)) {
    const playerId = Number(id);
    if (nextPlayers.some((player) => player.playerId === playerId)) continue;
    const known = players.find((player) => player.playerId === playerId);
    nextPlayers.push({
      playerId,
      name: (known?.playerName ?? `player ${playerId}`) as VisionPlayer["name"],
      stats: [{ statId: 0, stat: "MK8_POS", statValue: place }],
    });
  }
  const winner = nextPlayers.find((player) => player.stats.some((stat) => stat.stat === "MK8_POS" && stat.statValue === "1"));
  const next: AnalysisResults = {
    status: VisionResultCodes.CheckRequest,
    data: { players: nextPlayers, winner: winner ? [winner] : analysis.data.winner },
    message: `${analysis.message} One place was inferred.`.trim(),
  };
  return { ...match, analysis: next };
}

function placesOf(match: MatchManifest): Record<number, string> | null {
  if (!match.analysis || match.analysis.status === VisionResultCodes.Failed) return null;
  return placesFromAnalysis(match.analysis);
}

function placesFromAnalysis(analysis: AnalysisResults): Record<number, string> {
  if (analysis.status === VisionResultCodes.Failed) return {};
  const placed: Record<number, string> = {};
  for (const player of analysis.data.players) {
    if (typeof player.playerId !== "number") continue;
    placed[player.playerId] = player.stats.find((stat) => stat.stat === "MK8_POS")?.statValue ?? "?";
  }
  return placed;
}

async function decode(
  args: LocateArgs,
  start: number,
  dur: number,
  dir: string,
  width: number,
): Promise<{ t: number; file: string }[]> {
  const clamped = Math.max(0, start);
  const frames = await sampleFrames({
    ffmpegPath: args.ffmpegPath,
    videoPath: args.videoPath,
    framesDir: dir,
    fps: 1,
    sampleWidth: width,
    jpegQuality: 3,
    start: clamped,
    end: clamped + dur,
  });
  return frames.map((frame) => ({ t: frame.timestampSec, file: frame.filePath }));
}

interface DecisionCache {
  path: string;
  values: Map<string, Ans>;
}
interface ReadCache {
  path: string;
  values: Map<string, ReadOutcome>;
}

function loadCache(file: string): DecisionCache {
  const values = new Map<string, Ans>();
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n").filter(Boolean)) {
      const row = JSON.parse(line) as { key?: string; ans?: Ans };
      if (row.key && row.ans) values.set(row.key, row.ans);
    }
  }
  return { path: file, values };
}

function loadReads(file: string): ReadCache {
  const values = new Map<string, ReadCache["values"] extends Map<string, infer V> ? V : never>();
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n").filter(Boolean)) {
      const row = JSON.parse(line) as { key?: string; outcome?: ReadCache["values"] extends Map<string, infer V> ? V : never };
      if (row.key && row.outcome) values.set(row.key, row.outcome);
    }
  }
  return { path: file, values };
}

async function ask(
  client: OpenAI,
  cache: DecisionCache,
  file: string,
  questions: PredicateQuestion[],
  resize: boolean,
): Promise<Ans> {
  const key = `${file}|${questions.map((q) => q.name).join(",")}`;
  const cached = cache.values.get(key);
  if (cached) return cached;
  const buf = resize
    ? await sharp(file).resize({ width: ASK_WIDTH }).jpeg({ quality: 85 }).toBuffer()
    : await fs.promises.readFile(file);
  const decision = await askPredicates(client, buf.toString("base64"), questions);
  const ans: Ans = {};
  for (const q of questions) ans[q.name] = decision.probabilities[q.name] ?? 0;
  cache.values.set(key, ans);
  fs.mkdirSync(path.dirname(cache.path), { recursive: true });
  fs.appendFileSync(cache.path, JSON.stringify({ key, ans, tokens: decision.inputTokens }) + "\n");
  return ans;
}

async function readFrame(
  ctx: { reads: ReadCache; readers: ReturnType<typeof readerChain>; players: Player[]; gameId: number },
  file: string,
) {
  const cached = ctx.reads.values.get(file);
  if (cached) return cached;
  const outcome = await withQuietLogs(async () =>
    readWithFallback(ctx.readers, {
      base64Source: (await fs.promises.readFile(file)).toString("base64"),
      gameId: ctx.gameId,
      sessionPlayers: ctx.players,
    }),
  );
  ctx.reads.values.set(file, outcome);
  fs.mkdirSync(path.dirname(ctx.reads.path), { recursive: true });
  fs.appendFileSync(ctx.reads.path, JSON.stringify({ key: file, outcome }) + "\n");
  return outcome;
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await fn(items[index]);
      }
    }),
  );
  return out;
}
