import type { CallRecord, DatasetCase, Prediction } from "./types";

export interface CallScore {
  method: string;
  caseId: string;
  repeat: number;
  /** Expected stat values (players × on-screen stats). */
  cells: number;
  correct: number;
  /** Misses by cause: right player, wrong number / player missing / value left null. */
  wrongValue: number;
  missingPlayer: number;
  nullValue: number;
  playersExpected: number;
  playersFound: number;
  /** Mapped to a member who isn't on this scoreboard. */
  invented: number;
  /** Rows that mapped to no member (randoms or misread names). */
  unmapped: number;
  /** Exactly the recorded winners. */
  winnerExact: boolean;
  /** Every predicted winner is a recorded winner (tolerates a dropped row). */
  winningSide: boolean;
  failed: boolean;
}

/** Scoreboards show zero as "Ø"; compare values as integers when possible. */
export function normalizeValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  const zeroed = trimmed.replace(/[ØøOo]/g, "0");
  return /^-?\d+$/.test(zeroed) ? String(parseInt(zeroed, 10)) : trimmed;
}

export function scoreCall(record: CallRecord, testCase: DatasetCase): CallScore {
  const { expected } = testCase;
  const cells = expected.players.reduce((n, p) => n + Object.keys(p.stats).length, 0);
  const base: CallScore = {
    method: record.method,
    caseId: record.caseId,
    repeat: record.repeat,
    cells,
    correct: 0,
    wrongValue: 0,
    missingPlayer: 0,
    nullValue: 0,
    playersExpected: expected.players.length,
    playersFound: 0,
    invented: 0,
    unmapped: 0,
    winnerExact: false,
    winningSide: false,
    failed: record.prediction === null,
  };
  const prediction = record.prediction;
  if (!prediction) return { ...base, missingPlayer: cells };

  // First row per member wins; later duplicates count as unmapped noise.
  const byId = new Map<number, Prediction["players"][number]>();
  for (const row of prediction.players) {
    if (row.playerId === null || byId.has(row.playerId)) base.unmapped++;
    else byId.set(row.playerId, row);
  }

  const expectedIds = new Set(expected.players.map((p) => p.playerId));
  for (const id of byId.keys()) if (!expectedIds.has(id)) base.invented++;

  for (const player of expected.players) {
    const row = byId.get(player.playerId);
    const statCount = Object.keys(player.stats).length;
    if (!row) {
      base.missingPlayer += statCount;
      continue;
    }
    base.playersFound++;
    for (const [stat, value] of Object.entries(player.stats)) {
      const got = normalizeValue(row.stats[stat as keyof typeof row.stats]);
      if (got === null) base.nullValue++;
      else if (got === normalizeValue(value)) base.correct++;
      else base.wrongValue++;
    }
  }

  const predicted = [...new Set(prediction.winnerIds)].sort((a, b) => a - b);
  const actual = [...new Set(expected.winnerIds)].sort((a, b) => a - b);
  base.winnerExact = predicted.length > 0 && predicted.join() === actual.join();
  base.winningSide = predicted.length > 0 && predicted.every((id) => actual.includes(id));
  return base;
}

/**
 * Share of cells whose predicted value is identical in every repeat — how
 * repeatable a method is, independent of whether it's right.
 */
export function consistency(records: CallRecord[]): number | null {
  const byCase = new Map<string, CallRecord[]>();
  for (const r of records) byCase.set(r.caseId, [...(byCase.get(r.caseId) ?? []), r]);
  let stable = 0;
  let total = 0;
  for (const runs of byCase.values()) {
    if (runs.length < 2) continue;
    const keys = new Set<string>();
    for (const run of runs)
      for (const row of run.prediction?.players ?? [])
        for (const stat of Object.keys(row.stats)) keys.add(`${row.playerId ?? row.label}|${stat}`);
    for (const key of keys) {
      const [who, stat] = key.split("|");
      const values = runs.map((run) => {
        const row = run.prediction?.players.find((p) => `${p.playerId ?? p.label}` === who);
        return normalizeValue(row?.stats[stat as keyof typeof row.stats] ?? null);
      });
      total++;
      if (values.every((v) => v === values[0])) stable++;
    }
  }
  return total === 0 ? null : stable / total;
}

/** 95% Wilson score interval for k successes out of n. */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}
