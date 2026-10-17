import { describe, expect, it } from "vitest";
import {
  dayWinStreaks,
  gameRecords,
  primesByGame,
  primeWindow,
  type RecordSession,
  type SessionLine,
  type StreakSession,
} from "../streaks";
import type { MatchRow } from "../member-profile";

const day = (sessionId: number, winners: string[]): StreakSession => ({
  sessionId,
  sessionName: `Session ${sessionId}`,
  date: new Date(`2026-01-${String(sessionId).padStart(2, "0")}`),
  dayWinners: winners.map((playerName) => ({ playerName })),
});

describe("dayWinStreaks", () => {
  it("returns nothing when no session has day winners", () => {
    expect(dayWinStreaks([day(1, []), day(2, [])])).toEqual([]);
  });

  it("counts consecutive sessions and reports the current run", () => {
    const [a] = dayWinStreaks([day(1, ["A"]), day(2, ["A"]), day(3, ["A"])]);
    expect(a.player).toBe("A");
    expect(a.longest.length).toBe(3);
    expect(a.longest.from).toEqual(new Date("2026-01-01"));
    expect(a.longest.to).toEqual(new Date("2026-01-03"));
    expect(a.current).toBe(3);
  });

  it("breaks a run when another player wins the day", () => {
    const streaks = dayWinStreaks([
      day(1, ["A"]),
      day(2, ["A"]),
      day(3, ["B"]),
      day(4, ["A"]),
    ]);
    const a = streaks.find((s) => s.player === "A")!;
    expect(a.longest.length).toBe(2);
    expect(a.current).toBe(1);
  });

  it("skips sessions without day winners instead of breaking the run", () => {
    const a = dayWinStreaks([day(1, ["A"]), day(2, []), day(3, ["A"])]).find(
      (s) => s.player === "A",
    )!;
    expect(a.longest.length).toBe(2);
    expect(a.current).toBe(2);
  });

  it("reports a current streak of 0 once the latest recorded session lacks the player", () => {
    const streaks = dayWinStreaks([
      day(1, ["A"]),
      day(2, ["A"]),
      day(3, ["B"]),
    ]);
    expect(streaks.find((s) => s.player === "A")).toMatchObject({
      current: 0,
      longest: { length: 2 },
    });
    expect(streaks.find((s) => s.player === "B")).toMatchObject({
      current: 1,
    });
  });

  it("sorts longest first and keeps the earliest run on ties", () => {
    const streaks = dayWinStreaks([
      day(1, ["A"]),
      day(2, ["B"]),
      day(3, ["A"]),
      day(4, ["B"]),
      day(5, ["C"]),
    ]);
    expect(streaks.map((s) => s.player)).toEqual(["A", "B", "C"]);
    expect(streaks[0].longest.from).toEqual(new Date("2026-01-01"));
  });

  it("orders sessions by date before measuring runs", () => {
    const streaks = dayWinStreaks([day(2, ["A"]), day(1, ["A"])]);
    expect(streaks[0].longest.length).toBe(2);
    expect(streaks[0].longest.from).toEqual(new Date("2026-01-01"));
  });
});

const stat = (playerName: string, statName: string, value: string) => ({
  value,
  player: { playerName },
  gameStat: { statName },
});

/** A session with one match per entry: `[winner, stats]` pairs. */
const recordSession = (
  sessionId: number,
  date: string,
  matches: { winners: string[]; stats: ReturnType<typeof stat>[][] }[],
): RecordSession => ({
  sessionId,
  sessionName: `Session ${sessionId}`,
  date: new Date(date),
  dayWinners: [],
  sets: [
    {
      matches: matches.map((m) => ({
        matchWinners: m.winners.map((playerName) => ({ playerName })),
        playerSessions: m.stats.map((playerStats) => ({ playerStats })),
      })),
    },
  ],
});

describe("gameRecords", () => {
  it("returns nothing for no sessions", () => {
    expect(gameRecords([])).toEqual([]);
  });

  it("records the best session total for number stats and match wins", () => {
    const records = gameRecords([
      recordSession(1, "2026-01-01", [
        {
          winners: ["A"],
          stats: [[stat("A", "RL_GOALS", "2")], [stat("B", "RL_GOALS", "1")]],
        },
        { winners: ["A", "B"], stats: [[stat("A", "RL_GOALS", "3")]] },
      ]),
      recordSession(2, "2026-01-02", [
        { winners: ["B"], stats: [[stat("B", "RL_GOALS", "4")]] },
      ]),
    ]);
    const goals = records.find((r) => r.statName === "RL_GOALS")!;
    expect(goals).toMatchObject({
      label: "Goals",
      kind: "total",
      player: "A",
      value: 5,
      sessionId: 1,
    });
    const wins = records.find((r) => r.statName === "MATCH_WINS")!;
    expect(wins).toMatchObject({ player: "A", value: 2, sessionId: 1 });
  });

  it("records the lowest session average for position stats", () => {
    const records = gameRecords([
      recordSession(1, "2026-01-01", [
        {
          winners: [],
          stats: [[stat("A", "MK8_POS", "1")], [stat("A", "MK8_POS", "5")]],
        },
        { winners: [], stats: [[stat("B", "MK8_POS", "2")]] },
      ]),
      recordSession(2, "2026-01-02", [
        { winners: [], stats: [[stat("C", "MK8_POS", "3")]] },
      ]),
    ]);
    expect(records.find((r) => r.statName === "MK8_POS")).toMatchObject({
      kind: "average",
      player: "B",
      value: 2,
      sessionId: 1,
    });
  });

  it("ignores day and death stats, unknown stats and blank values", () => {
    const records = gameRecords([
      recordSession(1, "2026-01-01", [
        {
          winners: [],
          stats: [
            [stat("A", "MK8_DAY", "9"), stat("A", "COD_DEATHS", "9")],
            [stat("A", "RL_SAVES", " "), stat("A", "RL_SAVES", "x")],
          ],
        },
      ]),
    ]);
    expect(records).toEqual([]);
  });

  it("keeps the earliest session on ties", () => {
    const records = gameRecords([
      recordSession(2, "2026-01-02", [{ winners: ["A"], stats: [] }]),
      recordSession(1, "2026-01-01", [{ winners: ["B"], stats: [] }]),
    ]);
    expect(records[0]).toMatchObject({ player: "B", sessionId: 1 });
  });
});

const line = (sessionId: number, wins: number, matches = 2): SessionLine => ({
  sessionId,
  sessionName: `Session ${sessionId}`,
  date: new Date(`2026-02-${String(sessionId).padStart(2, "0")}`),
  matches,
  wins,
});

describe("primeWindow", () => {
  it("returns null with fewer than n sessions", () => {
    expect(primeWindow([line(1, 2), line(2, 2)], 3)).toBeNull();
  });

  it("picks the best consecutive window by win rate", () => {
    const prime = primeWindow(
      [line(1, 0), line(2, 2), line(3, 2), line(4, 0), line(5, 1)],
      2,
    )!;
    expect(prime.from.sessionId).toBe(2);
    expect(prime.to.sessionId).toBe(3);
    expect(prime).toMatchObject({ sessions: 2, wins: 4, matches: 4, rate: 1 });
  });

  it("prefers the more recent window on ties", () => {
    const prime = primeWindow(
      [line(1, 1), line(2, 1), line(3, 1), line(4, 1)],
      2,
    )!;
    expect(prime.from.sessionId).toBe(3);
  });

  it("ignores sessions with no matches", () => {
    const prime = primeWindow([line(1, 0, 0), line(2, 1), line(3, 1)], 2)!;
    expect(prime.from.sessionId).toBe(2);
  });
});

describe("primesByGame", () => {
  const matchRow = (
    matchId: number,
    sessionId: number,
    gameName: string,
  ): MatchRow => ({
    matchId,
    set: {
      session: {
        sessionId,
        sessionName: `Session ${sessionId}`,
        date: new Date(`2026-03-${String(sessionId).padStart(2, "0")}`),
        Game: { gameName },
      },
    },
  });

  it("counts a match once when it is both played and won", () => {
    const played = [
      matchRow(1, 1, "Rocket League"),
      matchRow(2, 1, "Rocket League"),
    ];
    const wins = [matchRow(1, 1, "Rocket League")];
    const [entry] = primesByGame(played, wins, 1);
    expect(entry.gameName).toBe("Rocket League");
    expect(entry.prime).toMatchObject({ matches: 2, wins: 1, rate: 0.5 });
  });

  it("splits games and drops those with too few sessions", () => {
    const played = [
      matchRow(1, 1, "Rocket League"),
      matchRow(2, 2, "Rocket League"),
      matchRow(3, 3, "Mario Kart 8"),
    ];
    const wins = [matchRow(1, 1, "Rocket League")];
    const result = primesByGame(played, wins, 2);
    expect(result.map((r) => r.gameName)).toEqual(["Rocket League"]);
    expect(result[0].prime).toMatchObject({ wins: 1, matches: 2, sessions: 2 });
  });
});
