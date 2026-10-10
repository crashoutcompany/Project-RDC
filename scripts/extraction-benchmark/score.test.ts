import { consistency, normalizeValue, scoreCall, wilson } from "./score";
import type { CallRecord, DatasetCase, Prediction } from "./types";

const testCase: DatasetCase = {
  id: "match-01",
  image: "/dev/null",
  matchId: 1,
  expected: {
    players: [
      { playerId: 2, name: "Dylan", stats: { RL_GOALS: "1", RL_SAVES: "0" } },
      { playerId: 3, name: "Ben", stats: { RL_GOALS: "2", RL_SAVES: "1" } },
      { playerId: 1, name: "Mark", stats: { RL_GOALS: "0", RL_SAVES: "3" } },
    ],
    winnerIds: [2, 3],
  },
};

const call = (prediction: Prediction | null, repeat = 1): CallRecord => ({
  method: "m",
  caseId: "match-01",
  repeat,
  startedAt: "",
  latencyMs: 0,
  usage: { inputTokens: null, outputTokens: null, reasoningTokens: null },
  costUsd: null,
  schemaValid: prediction !== null,
  servedBy: null,
  error: null,
  prediction,
  raw: null,
});

const row = (playerId: number | null, goals: string | null, saves: string | null, label = "x") => ({
  playerId,
  label,
  team: null,
  stats: { RL_GOALS: goals, RL_SAVES: saves },
});

test("normalizes the scoreboard's slashed zero and padding", () => {
  expect(normalizeValue("Ø")).toBe("0");
  expect(normalizeValue(" 07 ")).toBe("7");
  expect(normalizeValue(null)).toBeNull();
  expect(normalizeValue("Bob")).toBe("Bob");
});

test("a perfect reading scores every cell", () => {
  const s = scoreCall(
    call({ players: [row(2, "1", "Ø"), row(3, "2", "1"), row(1, "0", "3")], winnerIds: [3, 2] }),
    testCase,
  );
  expect(s).toMatchObject({ cells: 6, correct: 6, playersFound: 3, winnerExact: true, winningSide: true });
});

test("classifies misses and penalizes invented players", () => {
  const s = scoreCall(
    call({
      players: [row(2, "1", "5"), row(3, "2", null), row(7, "0", "0", "random"), row(null, "1", "1")],
      winnerIds: [3],
    }),
    testCase,
  );
  expect(s).toMatchObject({
    correct: 2,
    wrongValue: 1,
    nullValue: 1,
    missingPlayer: 2, // Mark's row never appears
    playersFound: 2,
    invented: 1,
    unmapped: 1,
    winnerExact: false,
    winningSide: true, // Ben is a real winner even though Dylan is missing
  });
});

test("a failed call counts every cell as missing", () => {
  expect(scoreCall(call(null), testCase)).toMatchObject({ correct: 0, missingPlayer: 6, failed: true });
});

test("consistency is the share of values identical across repeats", () => {
  const a = call({ players: [row(2, "1", "0")], winnerIds: [] }, 1);
  const b = call({ players: [row(2, "1", "4")], winnerIds: [] }, 2);
  expect(consistency([a, b])).toBe(0.5);
  expect(consistency([a])).toBeNull();
});

test("wilson interval brackets the observed rate", () => {
  const [lo, hi] = wilson(367, 370);
  expect(lo).toBeGreaterThan(0.97);
  expect(hi).toBeLessThan(1);
  expect(wilson(0, 0)).toEqual([0, 0]);
});
