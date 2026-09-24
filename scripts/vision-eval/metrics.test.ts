import { scoreCase, summarize, type FixtureExpectation } from "./metrics";
import type { CaseResult } from "./run-case";

const expected: FixtureExpectation = {
  gameId: 2,
  sessionPlayers: ["Mark", "Dylan"],
  players: [
    { name: "Mark", stats: { RL_GOALS: "3", RL_ASSISTS: "1" } },
    { name: "Dylan", stats: { RL_GOALS: "1" } },
  ],
  winners: ["Mark"],
};

describe("scoreCase", () => {
  it("scores a fully correct result as 100%", () => {
    const actual: CaseResult = {
      status: "Success",
      players: [
        { name: "Mark", stats: [
          { statId: 1, stat: "RL_GOALS", statValue: "3" },
          { statId: 2, stat: "RL_ASSISTS", statValue: "1" },
        ] },
        { name: "Dylan", stats: [{ statId: 1, stat: "RL_GOALS", statValue: "1" }] },
      ],
      winners: ["Mark"],
      durationMs: 500,
    };

    const metric = scoreCase("case-1", expected, actual);
    expect(metric.playerMatchRate).toBe(1);
    expect(metric.statMatches).toBe(3);
    expect(metric.statTotal).toBe(3);
    expect(metric.winnerCorrect).toBe(true);
  });

  it("penalizes a missing player and a wrong stat value", () => {
    const actual: CaseResult = {
      status: "Success",
      players: [
        {
          name: "Mark",
          stats: [{ statId: 1, stat: "RL_GOALS", statValue: "2" }], // wrong, and RL_ASSISTS missing
        },
        // Dylan missing entirely
      ],
      winners: ["Mark"],
      durationMs: 500,
    };

    const metric = scoreCase("case-2", expected, actual);
    expect(metric.playerMatchRate).toBe(0.5); // 1 of 2 expected players found
    expect(metric.statMatches).toBe(0); // RL_GOALS wrong, RL_ASSISTS unmatched, Dylan's stat unmatched
    expect(metric.statTotal).toBe(3);
  });

  it("treats a different winner set as incorrect regardless of size", () => {
    const actual: CaseResult = {
      status: "Success",
      players: [],
      winners: ["Dylan"],
      durationMs: 10,
    };
    expect(scoreCase("case-3", expected, actual).winnerCorrect).toBe(false);
  });

  it("handles a Failed result with no players", () => {
    const actual: CaseResult = {
      status: "Failed",
      message: "boom",
      durationMs: 5,
    };
    const metric = scoreCase("case-4", expected, actual);
    expect(metric.status).toBe("Failed");
    expect(metric.playerMatchRate).toBe(0);
    expect(metric.statMatches).toBe(0);
    expect(metric.winnerCorrect).toBe(false);
  });
});

describe("summarize", () => {
  it("aggregates rates and latency percentiles across cases", () => {
    const metrics = [
      { fixtureId: "a", status: "Success", durationMs: 100, playerMatchRate: 1, statMatches: 2, statTotal: 2, winnerCorrect: true },
      { fixtureId: "b", status: "CheckReq", durationMs: 200, playerMatchRate: 0.5, statMatches: 1, statTotal: 2, winnerCorrect: false },
      { fixtureId: "c", status: "Failed", durationMs: 300, playerMatchRate: 0, statMatches: 0, statTotal: 0, winnerCorrect: false },
    ];

    const summary = summarize("azure-di", metrics);
    expect(summary.cases).toBe(3);
    expect(summary.successRate).toBeCloseTo(1 / 3);
    expect(summary.checkRequestRate).toBeCloseTo(1 / 3);
    expect(summary.failureRate).toBeCloseTo(1 / 3);
    expect(summary.playerMatchRate).toBeCloseTo(1.5 / 3);
    expect(summary.statMatchRate).toBeCloseTo(3 / 4);
    expect(summary.winnerAccuracy).toBeCloseTo(1 / 3);
    expect(summary.p50Ms).toBe(200);
    expect(summary.p95Ms).toBe(300);
  });

  it("returns all-zero rates for an empty case list", () => {
    const summary = summarize("azure-di", []);
    expect(summary.cases).toBe(0);
    expect(summary.successRate).toBe(0);
    expect(summary.statMatchRate).toBe(0);
    expect(summary.p50Ms).toBe(0);
  });
});
