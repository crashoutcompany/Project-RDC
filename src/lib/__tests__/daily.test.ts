import { describe, expect, it } from "vitest";
import { GamesEnum } from "@/lib/constants";
import type { Arena, PlayerRecord } from "@/lib/rdc-stats";
import {
  buildCandidates,
  dayKeyFor,
  emptyStats,
  evaluateGuess,
  gameStatus,
  parseGuess,
  previousDay,
  puzzleNumber,
  rankBoard,
  recordResult,
  selectPuzzle,
  shareText,
  type CountPuzzle,
  type DailyPuzzle,
  type LeaderPuzzle,
} from "../daily";

const rec = (name: string, matches: number, sets = 0, days = 0) =>
  ({ name, matches, sets, days, avgPos: null }) satisfies PlayerRecord;

const arena = (
  slug: GamesEnum,
  name: string,
  records: PlayerRecord[],
): Arena => ({
  slug,
  name,
  image: "",
  index: 1,
  sessions: 1,
  matches: 0,
  sets: 0,
  lastPlayed: null,
  champion: null,
  records: Object.fromEntries(records.map((r) => [r.name.toLowerCase(), r])),
});

const members = ["Mark", "Dylan", "Ben", "Leo"].map((name) => ({
  slug: name.toLowerCase(),
  name,
}));

const arenas = [
  arena(GamesEnum.MarioKart8, "Mario Kart 8", [
    rec("Mark", 20, 6, 2),
    rec("Dylan", 16, 6, 1),
    rec("Ben", 5, 1),
  ]),
  arena(GamesEnum.RocketLeague, "Rocket League", [
    rec("Ben", 9, 3),
    rec("Leo", 4, 1),
  ]),
];

const candidates = buildCandidates(arenas, members);

const leader = (id: string) =>
  candidates.find((c) => c.id === id) as LeaderPuzzle;
const count = (id: string) =>
  candidates.find((c) => c.id === id) as CountPuzzle;

describe("dayKeyFor", () => {
  it("rolls over at midnight Eastern, not UTC", () => {
    // 03:59 UTC on Nov 3 is still Nov 2 in New York (EST, UTC-5).
    expect(dayKeyFor(new Date("2026-11-03T04:59:00Z"))).toBe("2026-11-02");
    expect(dayKeyFor(new Date("2026-11-03T05:00:00Z"))).toBe("2026-11-03");
  });

  it("handles daylight saving time", () => {
    // EDT is UTC-4.
    expect(dayKeyFor(new Date("2026-07-04T03:59:00Z"))).toBe("2026-07-03");
    expect(dayKeyFor(new Date("2026-07-04T04:00:00Z"))).toBe("2026-07-04");
  });
});

describe("puzzleNumber / previousDay", () => {
  it("counts days from the epoch", () => {
    expect(puzzleNumber("2026-11-01")).toBe(1);
    expect(puzzleNumber("2026-11-02")).toBe(2);
    expect(puzzleNumber("2027-11-01")).toBe(366);
  });

  it("steps back across month and year boundaries", () => {
    expect(previousDay("2026-12-01")).toBe("2026-11-30");
    expect(previousDay("2027-01-01")).toBe("2026-12-31");
  });
});

describe("rankBoard", () => {
  it("sorts by value and shares ranks on ties", () => {
    const board = rankBoard([
      { slug: "a", name: "A", value: 3 },
      { slug: "b", name: "B", value: 7 },
      { slug: "c", name: "C", value: 3 },
      { slug: "d", name: "D", value: 1 },
    ]);
    expect(board.map((r) => [r.slug, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 2],
      ["d", 4],
    ]);
  });
});

describe("buildCandidates", () => {
  it("builds leader puzzles only when there is a single leader", () => {
    const ids = candidates.filter((c) => c.kind === "leader").map((c) => c.id);
    expect(ids).toContain("leader:mariokart8:matches");
    expect(ids).toContain("leader:mariokart8:days");
    // Mark and Dylan tie on MK8 set wins.
    expect(ids).not.toContain("leader:mariokart8:sets");
  });

  it("includes every roster member on the board, at 0 when absent", () => {
    const board = leader("leader:rocketleague:matches").board;
    expect(board.map((r) => [r.slug, r.value])).toEqual([
      ["ben", 9],
      ["leo", 4],
      ["dylan", 0],
      ["mark", 0],
    ]);
  });

  it("skips count puzzles for tiny stats", () => {
    expect(count("count:mariokart8:matches:mark").answer).toBe(20);
    expect(count("count:mariokart8:days:mark")).toBeUndefined();
  });
});

describe("selectPuzzle", () => {
  it("returns the same puzzle for the same day", () => {
    const a = selectPuzzle("2026-11-05", candidates);
    const b = selectPuzzle("2026-11-05", [...candidates].reverse());
    expect(a).toEqual(b);
    expect(a?.dayKey).toBe("2026-11-05");
    expect(a?.number).toBe(5);
  });

  it("alternates leader and count days", () => {
    expect(selectPuzzle("2026-11-01", candidates)?.kind).toBe("leader");
    expect(selectPuzzle("2026-11-02", candidates)?.kind).toBe("count");
  });

  it("falls back to whatever kind exists", () => {
    const onlyCounts = candidates.filter((c) => c.kind === "count");
    expect(selectPuzzle("2026-11-01", onlyCounts)?.kind).toBe("count");
  });

  it("varies across days", () => {
    const ids = new Set(
      Array.from(
        { length: 30 },
        (_, i) =>
          selectPuzzle(
            new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10),
            candidates,
          )?.id,
      ),
    );
    expect(ids.size).toBeGreaterThan(3);
  });

  it("mostly keeps today's pick when a new candidate appears", () => {
    const extra = buildCandidates(
      [
        ...arenas,
        arena(GamesEnum.CallOfDuty, "Call of Duty", [rec("Leo", 12)]),
      ],
      members,
    );
    let same = 0;
    for (let i = 0; i < 60; i++) {
      const day = new Date(Date.UTC(2026, 10, 1 + i))
        .toISOString()
        .slice(0, 10);
      const before = selectPuzzle(day, candidates)!;
      const after = selectPuzzle(day, extra)!;
      // A changed pick must be one of the new candidates.
      if (before.id === after.id) same++;
      else expect(after.id).toContain("callofduty");
    }
    expect(same).toBeGreaterThan(30);
  });

  it("returns null with no stats", () => {
    expect(selectPuzzle("2026-11-01", [])).toBeNull();
  });
});

describe("evaluateGuess", () => {
  const mk8 = leader("leader:mariokart8:matches");

  it("grades leader guesses", () => {
    expect(evaluateGuess(mk8, "mark").verdict).toBe("correct");
    // Dylan is 2nd with 16 of 20.
    expect(evaluateGuess(mk8, "dylan")).toMatchObject({
      verdict: "close",
      row: { value: 16, rank: 2 },
    });
    expect(evaluateGuess(mk8, "ben")).toMatchObject({
      verdict: "miss",
      row: { value: 5, rank: 3 },
    });
  });

  it("grades count guesses with direction and a close margin", () => {
    const puzzle = count("count:mariokart8:matches:mark"); // answer 20, margin 2
    expect(evaluateGuess(puzzle, "20")).toEqual({ verdict: "correct" });
    expect(evaluateGuess(puzzle, "18")).toEqual({
      verdict: "close",
      direction: "higher",
    });
    expect(evaluateGuess(puzzle, "23")).toEqual({
      verdict: "miss",
      direction: "lower",
    });
  });
});

describe("parseGuess", () => {
  it("accepts roster slugs for leader puzzles", () => {
    const puzzle = leader("leader:mariokart8:matches");
    expect(parseGuess(puzzle, " Mark ")).toBe("mark");
    expect(parseGuess(puzzle, "nobody")).toBeNull();
  });

  it("accepts whole numbers for count puzzles", () => {
    const puzzle = count("count:mariokart8:matches:mark");
    expect(parseGuess(puzzle, "007")).toBe("7");
    expect(parseGuess(puzzle, "-3")).toBeNull();
    expect(parseGuess(puzzle, "2.5")).toBeNull();
    expect(parseGuess(puzzle, "")).toBeNull();
  });
});

describe("gameStatus", () => {
  const puzzle = count("count:mariokart8:matches:mark");
  it("ends on a correct guess or after six", () => {
    expect(gameStatus(puzzle, ["1", "20"])).toBe("won");
    expect(gameStatus(puzzle, ["1", "2"])).toBe("playing");
    expect(gameStatus(puzzle, ["1", "2", "3", "4", "5", "6"])).toBe("lost");
  });
});

describe("shareText", () => {
  const daily = (p: LeaderPuzzle | CountPuzzle): DailyPuzzle => ({
    ...p,
    dayKey: "2026-11-12",
    number: 12,
  });

  it("shows the puzzle number, score and grid without the answer", () => {
    const puzzle = daily(leader("leader:mariokart8:matches"));
    const text = shareText(puzzle, ["ben", "dylan", "mark"]);
    expect(text).toBe("RDC Daily #12 3/6\n⬛🟨🟩\nrdcstats.com/daily");
    expect(text).not.toMatch(/mark|dylan|ben|mario/i);
  });

  it("uses X for a loss and arrows for count hints, not numbers", () => {
    const puzzle = daily(count("count:mariokart8:matches:mark"));
    const text = shareText(puzzle, ["1", "30", "19", "21", "40", "0"]);
    expect(text.split("\n")[0]).toBe("RDC Daily #12 X/6");
    expect(text).toContain("⬛⬆️\n⬛⬇️\n🟨⬆️\n🟨⬇️");
    expect(text).not.toMatch(/\b20\b|mark/i);
  });
});

describe("recordResult", () => {
  it("builds a streak over consecutive wins and resets on a loss", () => {
    let stats = recordResult(emptyStats(), "2026-11-01", true, 3);
    stats = recordResult(stats, "2026-11-02", true, 1);
    expect(stats).toMatchObject({ played: 2, won: 2, streak: 2, maxStreak: 2 });
    expect(stats.distribution).toEqual([1, 0, 1, 0, 0, 0]);

    stats = recordResult(stats, "2026-11-03", false, 6);
    expect(stats).toMatchObject({ played: 3, won: 2, streak: 0, maxStreak: 2 });
  });

  it("restarts the streak after a skipped day", () => {
    let stats = recordResult(emptyStats(), "2026-11-01", true, 2);
    stats = recordResult(stats, "2026-11-03", true, 2);
    expect(stats.streak).toBe(1);
  });

  it("counts a day only once", () => {
    const stats = recordResult(emptyStats(), "2026-11-01", true, 2);
    expect(recordResult(stats, "2026-11-01", true, 2)).toBe(stats);
  });
});
