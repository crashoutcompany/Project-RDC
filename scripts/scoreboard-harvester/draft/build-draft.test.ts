import { VisionResultCodes } from "@/lib/constants";
import type { VisionPlayer } from "@/lib/visionTypes";
import type { MatchManifest } from "../types";
import { buildDraft } from "./build-draft";

let clock = 0;

/** One RL scoreboard: `blue` beats `orange` unless `orangeWins`. */
function rlMatch(
  blue: number[],
  orange: number[],
  opts: { orangeWins?: boolean; goals?: number; status?: VisionResultCodes } = {},
): MatchManifest {
  clock += 400;
  const player = (playerId: number, teamKey: string): VisionPlayer => ({
    playerId,
    name: "Mark",
    teamKey,
    stats: [{ statId: 2, stat: "RL_GOALS", statValue: String(opts.goals ?? clock) }],
  });
  const players = [
    ...blue.map((id) => player(id, "BluePlayers")),
    ...orange.map((id) => player(id, "OrangePlayers")),
  ];
  const winners = opts.orangeWins ? players.slice(blue.length) : players.slice(0, blue.length);
  return {
    match: clock / 400,
    timestampSec: clock,
    timestampStr: "",
    runLengthFrames: 3,
    imagePath: `match-${clock}.png`,
    ocrKeywords: [],
    analysis: {
      status: opts.status ?? VisionResultCodes.Success,
      data: { players, winner: winners },
      message: "",
    } as MatchManifest["analysis"],
  };
}

beforeEach(() => {
  clock = 0;
});

const A = [2, 3, 8];
const B = [1, 4, 5];
const firstTo3 = { kind: "firstTo", wins: 3 } as const;

test("splits a Rocket League session into first-to-3 series", () => {
  const draft = buildDraft({
    setRule: firstTo3,
    matches: [
      rlMatch(A, B),
      rlMatch(B, A, { orangeWins: true }), // colours swap; A wins again
      rlMatch(A, B, { orangeWins: true }),
      rlMatch(A, B, { orangeWins: true }),
      rlMatch(A, B), // A wins 3-2
      rlMatch(A, B),
      rlMatch(A, B),
      rlMatch(A, B), // A wins 3-0
    ],
  });

  expect(draft.sets.map((s) => s.matches.length)).toEqual([5, 3]);
  expect(draft.sets[0].winnerIds).toEqual(A);
  expect(draft.warnings).toEqual([]);
});

test("starts a new set when the teams change and warns about the short one", () => {
  const draft = buildDraft({
    setRule: firstTo3,
    matches: [rlMatch(A, B), rlMatch([1, 2, 3], [4, 5, 8]), rlMatch([1, 2, 3], [4, 5, 8])],
  });

  expect(draft.sets.map((s) => s.matches.length)).toEqual([1, 2]);
  expect(draft.warnings).toHaveLength(2);
});

test("skips failed, randoms-only, and duplicate scoreboards", () => {
  const failed: MatchManifest = {
    ...rlMatch(A, B),
    analysis: { status: VisionResultCodes.Failed, message: "timeout" },
  };
  const draft = buildDraft({
    setRule: firstTo3,
    matches: [
      failed,
      rlMatch([2], []),
      rlMatch(A, B, { goals: 1 }),
      rlMatch(A, B, { goals: 1 }),
    ],
  });

  expect(draft.skipped.map((s) => s.reason)).toEqual([
    "analysis failed: timeout",
    "only 1 RDC player(s) recognized",
    "duplicate of scoreboard 3",
  ]);
  expect(draft.sets).toHaveLength(1);
});

test("fixed sets chunk matches and share ties", () => {
  const draft = buildDraft({
    setRule: { kind: "fixed", size: 2 },
    matches: [rlMatch([1], [2]), rlMatch([1], [2], { orangeWins: true }), rlMatch([1], [2])],
  });

  expect(draft.sets.map((s) => s.matches.length)).toEqual([2, 1]);
  expect(draft.sets[0].winnerIds).toEqual([1, 2]);
  expect(draft.warnings).toContain(
    "Last set has 1 of 2 matches — a scoreboard may have been missed.",
  );
});

test("flags low-confidence reads for review", () => {
  const draft = buildDraft({
    matches: [rlMatch(A, B, { status: VisionResultCodes.CheckRequest })],
  });

  expect(draft.sets[0].matches[0].needsReview).toBe(true);
  expect(draft.warnings[0]).toMatch(/low-confidence/);
});
