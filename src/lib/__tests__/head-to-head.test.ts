import { describe, expect, it } from "vitest";
import { headToHead, type BattleFeed } from "../head-to-head";
import type { Sessions } from "@/app/(routes)/(groups)/games/[slug]/_helpers/dashboard";

/** Fixtures carry only the fields the aggregation reads. */
const feed = (slug: string, name: string, sessions: unknown[]): BattleFeed => ({
  slug,
  name,
  sessions: sessions as Sessions,
});

const ANA = 1;
const BEN = 2;
const CAL = 3;

const who = (playerId: number, playerName = `p${playerId}`) => ({
  playerId,
  playerName,
});
const stat = (playerId: number, statName: string, value: string) => ({
  value,
  player: who(playerId),
  gameStat: { statName },
});

/** One match: `players` each get the given stat rows. */
const match = (winners: number[], rows: ReturnType<typeof stat>[] = []) => ({
  matchWinners: winners.map((id) => who(id)),
  playerSessions: [{ playerStats: rows }],
});

const session = (
  sessionId: number,
  date: string,
  opts: {
    dayWinners?: number[];
    setWinners?: number[];
    matches?: ReturnType<typeof match>[];
  },
) => ({
  sessionId,
  sessionName: `S${sessionId}`,
  date: new Date(date),
  dayWinners: (opts.dayWinners ?? []).map((id) => who(id)),
  sets: [
    {
      setWinners: (opts.setWinners ?? []).map((id) => who(id)),
      matches: opts.matches ?? [],
    },
  ],
});

const mk8 = feed("mariokart8", "Mario Kart 8", [
  // Both play. Ana wins two matches and the set, Ben wins one match.
  session(10, "2025-06-01T12:00:00Z", {
    dayWinners: [ANA],
    setWinners: [ANA],
    matches: [
      match([ANA], [stat(ANA, "MK8_POS", "1"), stat(BEN, "MK8_POS", "3")]),
      match([BEN], [stat(ANA, "MK8_POS", "2"), stat(BEN, "MK8_POS", "1")]),
      match([ANA], [stat(ANA, "MK8_POS", "1"), stat(BEN, "MK8_POS", "4")]),
    ],
  }),
  // Only Ana plays: must not count toward the head-to-head.
  session(11, "2025-06-08T12:00:00Z", {
    dayWinners: [ANA],
    matches: [match([ANA], [stat(ANA, "MK8_POS", "1")])],
  }),
  // Both play, Ben wins the day.
  session(12, "2025-06-15T12:00:00Z", {
    dayWinners: [BEN],
    matches: [
      match([BEN], [stat(ANA, "MK8_POS", "5"), stat(BEN, "MK8_POS", "2")]),
    ],
  }),
]);

const rl = feed("rocketleague", "Rocket League", [
  session(20, "2025-07-01T12:00:00Z", {
    setWinners: [BEN],
    matches: [
      match([BEN], [stat(ANA, "RL_SCORE", "3"), stat(BEN, "RL_SCORE", "7")]),
    ],
  }),
]);

const unrelated = feed("lethalcompany", "Lethal Company", [
  session(30, "2025-08-01T12:00:00Z", {
    dayWinners: [CAL],
    matches: [match([CAL], [stat(CAL, "MK8_POS", "1")])],
  }),
]);

describe("headToHead", () => {
  it("counts only sessions where both players took part", () => {
    const result = headToHead(ANA, BEN, [mk8]);
    expect(result.shared).toBe(2);
    expect(result.games).toHaveLength(1);
    expect(result.games[0]).toMatchObject({
      slug: "mariokart8",
      name: "Mario Kart 8",
      shared: 2,
    });
  });

  it("tallies wins per side within shared sessions", () => {
    const result = headToHead(ANA, BEN, [mk8]);
    expect(result.a).toEqual({ matches: 2, sets: 1, days: 1 });
    expect(result.b).toEqual({ matches: 2, sets: 0, days: 1 });
    expect(result.games[0].a).toEqual(result.a);
    expect(result.games[0].b).toEqual(result.b);
  });

  it("averages stats per match and marks the better side (position: lower wins)", () => {
    const [game] = headToHead(ANA, BEN, [mk8]).games;
    const pos = game.stats.find((s) => s.statName === "MK8_POS");
    // Ana: 1,2,1,5 -> 2.25 ; Ben: 3,1,4,2 -> 2.5 (Ana better, lower)
    expect(pos?.a).toBeCloseTo(2.25);
    expect(pos?.b).toBeCloseTo(2.5);
    expect(pos?.better).toBe("a");
  });

  it("treats non-position stats as higher-is-better", () => {
    const result = headToHead(ANA, BEN, [rl]);
    const score = result.games[0].stats.find((s) => s.statName === "RL_SCORE");
    expect(score).toMatchObject({ a: 3, b: 7, better: "b" });
  });

  it("leaves better null on a tie and skips games with no shared sessions", () => {
    const tie = feed("tie", "Tie", [
      session(40, "2025-09-01T12:00:00Z", {
        matches: [
          match([], [stat(ANA, "RL_SCORE", "4"), stat(BEN, "RL_SCORE", "4")]),
        ],
      }),
    ]);
    const result = headToHead(ANA, BEN, [tie, unrelated]);
    expect(result.games.map((g) => g.slug)).toEqual(["tie"]);
    expect(result.games[0].stats[0].better).toBeNull();
  });

  it("sums totals across games", () => {
    const result = headToHead(ANA, BEN, [mk8, rl, unrelated]);
    expect(result.shared).toBe(3);
    expect(result.a.matches).toBe(2);
    expect(result.b.matches).toBe(3);
    expect(result.b.sets).toBe(1);
  });

  it("returns the latest five shared sessions, newest first", () => {
    const many = feed(
      "many",
      "Many",
      Array.from({ length: 7 }, (_, i) =>
        session(100 + i, `2025-0${i + 1}-01T12:00:00Z`, {
          dayWinners: [ANA],
          matches: [
            match(
              [ANA],
              [stat(ANA, "MK8_POS", "1"), stat(BEN, "MK8_POS", "2")],
            ),
          ],
        }),
      ),
    );
    const result = headToHead(ANA, BEN, [many]);
    expect(result.recent).toHaveLength(5);
    expect(result.recent.map((r) => r.sessionId)).toEqual([
      106, 105, 104, 103, 102,
    ]);
    expect(result.recent[0]).toMatchObject({
      sessionName: "S106",
      gameName: "Many",
      dayWinners: ["p1"],
    });
  });

  it("marks the lower death count as better", () => {
    const lc = feed("lethalcompany", "Lethal Company", [
      session(50, "2025-10-01T12:00:00Z", {
        matches: [
          match([], [stat(ANA, "LC_DEATHS", "5"), stat(BEN, "LC_DEATHS", "2")]),
        ],
      }),
    ]);
    const [game] = headToHead(ANA, BEN, [lc]).games;
    expect(game.stats.find((s) => s.statName === "LC_DEATHS")).toMatchObject({
      a: 5,
      b: 2,
      better: "b",
    });
  });

  it("skips Days Played stats", () => {
    const days = feed("mariokart8", "Mario Kart 8", [
      session(51, "2025-10-08T12:00:00Z", {
        matches: [
          match(
            [ANA],
            [
              stat(ANA, "MK8_DAY", "3"),
              stat(BEN, "MK8_DAY", "3"),
              stat(ANA, "MK8_POS", "1"),
              stat(BEN, "MK8_POS", "2"),
            ],
          ),
        ],
      }),
    ]);
    const [game] = headToHead(ANA, BEN, [days]).games;
    expect(game.stats.map((s) => s.statName)).toEqual(["MK8_POS"]);
  });

  it("gives no marker when only one side has a value", () => {
    const solo = feed("rocketleague", "Rocket League", [
      session(52, "2025-10-15T12:00:00Z", {
        matches: [
          // Ben appears in the session but his score is not numeric.
          match(
            [ANA],
            [stat(ANA, "RL_SCORE", "3"), stat(BEN, "RL_SCORE", "n/a")],
          ),
        ],
      }),
    ]);
    const [game] = headToHead(ANA, BEN, [solo]).games;
    expect(game.stats).toEqual([
      {
        statName: "RL_SCORE",
        displayName: expect.any(String),
        a: 3,
        b: null,
        better: null,
      },
    ]);
  });

  it("credits teammates' shared wins to neither side and counts them as together", () => {
    const team = feed("mariokart8", "Mario Kart 8", [
      session(60, "2025-11-01T12:00:00Z", {
        dayWinners: [ANA, BEN],
        setWinners: [ANA, BEN],
        matches: [
          match(
            [ANA, BEN],
            [stat(ANA, "MK8_POS", "1"), stat(BEN, "MK8_POS", "2")],
          ),
          match([ANA], [stat(ANA, "MK8_POS", "1"), stat(BEN, "MK8_POS", "3")]),
        ],
      }),
    ]);
    const result = headToHead(ANA, BEN, [team]);
    expect(result.a).toEqual({ matches: 1, sets: 0, days: 0 });
    expect(result.b).toEqual({ matches: 0, sets: 0, days: 0 });
    expect(result.together).toEqual({ matches: 1, sets: 1, days: 1 });
    expect(result.games[0].together).toEqual(result.together);
  });

  it("returns an empty result when the players never met", () => {
    const result = headToHead(ANA, CAL, [mk8, rl]);
    expect(result).toEqual({
      shared: 0,
      a: { matches: 0, sets: 0, days: 0 },
      b: { matches: 0, sets: 0, days: 0 },
      together: { matches: 0, sets: 0, days: 0 },
      games: [],
      recent: [],
    });
  });
});
