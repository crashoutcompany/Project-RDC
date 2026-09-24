import type { CaseResult } from "./run-case";

/** Ground truth for one fixture, at the level `analyzeScreenShot` finally returns. */
export interface FixtureExpectation {
  gameId: number;
  sessionPlayers: string[];
  /** Expected stats keyed by `StatName` (e.g. "RL_GOALS"), post-processor. */
  players: { name: string; stats: Record<string, string> }[];
  winners: string[];
}

export interface CaseMetric {
  fixtureId: string;
  status: string;
  durationMs: number;
  /** Fraction of expected players matched to an actual player by name. */
  playerMatchRate: number;
  statMatches: number;
  statTotal: number;
  winnerCorrect: boolean;
}

export const scoreCase = (
  fixtureId: string,
  expected: FixtureExpectation,
  actual: CaseResult,
): CaseMetric => {
  const actualPlayers = actual.players ?? [];
  let matchedPlayers = 0;
  let statMatches = 0;
  let statTotal = 0;

  for (const expectedPlayer of expected.players) {
    const actualPlayer = actualPlayers.find(
      (p) => p.name === expectedPlayer.name,
    );
    if (actualPlayer) matchedPlayers += 1;

    for (const [statName, expectedValue] of Object.entries(
      expectedPlayer.stats,
    )) {
      statTotal += 1;
      const actualValue = actualPlayer?.stats.find(
        (s) => s.stat === statName,
      )?.statValue;
      if (actualValue === expectedValue) statMatches += 1;
    }
  }

  const actualWinners = new Set(actual.winners ?? []);
  const expectedWinners = new Set(expected.winners);
  const winnerCorrect =
    actualWinners.size === expectedWinners.size &&
    [...expectedWinners].every((name) => actualWinners.has(name));

  return {
    fixtureId,
    status: actual.status,
    durationMs: actual.durationMs,
    playerMatchRate: expected.players.length
      ? matchedPlayers / expected.players.length
      : 1,
    statMatches,
    statTotal,
    winnerCorrect,
  };
};

const percentile = (sortedAsc: number[], p: number): number => {
  if (!sortedAsc.length) return 0;
  const index = Math.min(
    sortedAsc.length - 1,
    Math.floor((p / 100) * sortedAsc.length),
  );
  return sortedAsc[index];
};

export interface ProviderSummary {
  providerSpec: string;
  cases: number;
  successRate: number;
  checkRequestRate: number;
  failureRate: number;
  playerMatchRate: number;
  statMatchRate: number;
  winnerAccuracy: number;
  p50Ms: number;
  p95Ms: number;
}

export const summarize = (
  providerSpec: string,
  metrics: CaseMetric[],
): ProviderSummary => {
  const cases = metrics.length;
  const rate = (count: number) => (cases ? count / cases : 0);

  const totalStatMatches = metrics.reduce((sum, m) => sum + m.statMatches, 0);
  const totalStats = metrics.reduce((sum, m) => sum + m.statTotal, 0);
  const totalPlayerMatchRate = metrics.reduce(
    (sum, m) => sum + m.playerMatchRate,
    0,
  );
  const durationsAsc = metrics.map((m) => m.durationMs).sort((a, b) => a - b);

  return {
    providerSpec,
    cases,
    successRate: rate(metrics.filter((m) => m.status === "Success").length),
    checkRequestRate: rate(
      metrics.filter((m) => m.status === "CheckReq").length,
    ),
    failureRate: rate(metrics.filter((m) => m.status === "Failed").length),
    playerMatchRate: cases ? totalPlayerMatchRate / cases : 0,
    statMatchRate: totalStats ? totalStatMatches / totalStats : 0,
    winnerAccuracy: rate(metrics.filter((m) => m.winnerCorrect).length),
    p50Ms: percentile(durationsAsc, 50),
    p95Ms: percentile(durationsAsc, 95),
  };
};
