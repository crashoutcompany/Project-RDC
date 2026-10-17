import { describe, expect, it } from "vitest";
import {
  bestSessions,
  statBreakdown,
  trendByMonth,
  type MatchRow,
  type StatRow,
} from "../member-profile";

const mk8 = "Mario Kart 8";
const rl = "Rocket League";

const stat = (gameName: string, statName: string, value: string): StatRow => ({
  value,
  game: { gameName },
  gameStat: { statName },
});

const session = (
  sessionId: number,
  date: string,
  gameName = mk8,
  sessionName = `Session ${sessionId}`,
) => ({
  sessionId,
  sessionName,
  date: new Date(date),
  Game: { gameName },
});

const row = (matchId: number, s: ReturnType<typeof session>): MatchRow => ({
  matchId,
  set: { session: s },
});

describe("statBreakdown", () => {
  it("returns no games for empty input", () => {
    expect(statBreakdown([])).toEqual([]);
  });

  it("averages position stats (lower is better)", () => {
    const [game] = statBreakdown([
      stat(mk8, "MK8_POS", "1"),
      stat(mk8, "MK8_POS", "4"),
      stat(mk8, "MK8_POS", "3"),
    ]);
    expect(game.stats).toEqual([
      {
        statName: "MK8_POS",
        displayName: "Position",
        value: 8 / 3,
        kind: "average",
      },
    ]);
  });

  it("gives totals and per-session averages for number stats", () => {
    const [game] = statBreakdown([
      stat(rl, "RL_GOALS", "2"),
      stat(rl, "RL_GOALS", "4"),
    ]);
    expect(game).toMatchObject({ gameName: rl, gameSlug: "rocketleague" });
    expect(game.stats).toEqual([
      { statName: "RL_GOALS", displayName: "Goals", value: 6, kind: "total" },
      {
        statName: "RL_GOALS",
        displayName: "Goals",
        value: 3,
        kind: "perSession",
      },
    ]);
  });

  it("skips NaN and blank values without counting them", () => {
    const [game] = statBreakdown([
      stat(rl, "RL_SAVES", "5"),
      stat(rl, "RL_SAVES", "abc"),
      stat(rl, "RL_SAVES", "  "),
      stat(rl, "RL_SAVES", "1"),
    ]);
    expect(game.stats).toEqual([
      { statName: "RL_SAVES", displayName: "Saves", value: 6, kind: "total" },
      {
        statName: "RL_SAVES",
        displayName: "Saves",
        value: 3,
        kind: "perSession",
      },
    ]);
  });

  it("drops a position stat whose values are all unparseable", () => {
    expect(statBreakdown([stat(mk8, "MK8_POS", "x")])).toEqual([
      { gameName: mk8, gameSlug: "mariokart8", stats: [] },
    ]);
  });

  it("skips stats that are not in STAT_CONFIGS", () => {
    expect(statBreakdown([stat(mk8, "NOT_A_STAT", "3")])).toEqual([]);
  });

  it("orders games by name and stats by config order", () => {
    const result = statBreakdown([
      stat(rl, "RL_GOALS", "1"),
      stat(mk8, "MK8_POS", "2"),
      stat(rl, "RL_SCORE", "300"),
    ]);
    expect(result.map((g) => g.gameName)).toEqual([mk8, rl]);
    expect(result[1].stats.map((s) => s.statName)).toEqual([
      "RL_SCORE",
      "RL_SCORE",
      "RL_GOALS",
      "RL_GOALS",
    ]);
  });
});

describe("trendByMonth", () => {
  it("returns no points for empty input", () => {
    expect(trendByMonth([], [])).toEqual([]);
  });

  it("computes win rate per UTC month, sorted ascending", () => {
    const jun = session(1, "2025-06-20T12:00:00Z");
    const jul = session(2, "2025-07-02T12:00:00Z");
    const played = [row(1, jun), row(2, jun), row(3, jul), row(4, jul)];
    const wins = [row(1, jun), row(3, jul)];

    expect(trendByMonth(played, wins)).toEqual([
      { month: "2025-06", matches: 2, wins: 1, winRate: 0.5 },
      { month: "2025-07", matches: 2, wins: 1, winRate: 0.5 },
    ]);
  });

  it("counts a win as a played match even if it is missing from the played list", () => {
    const jun = session(1, "2025-06-01T00:00:00Z");
    expect(trendByMonth([], [row(9, jun)])).toEqual([
      { month: "2025-06", matches: 1, wins: 1, winRate: 1 },
    ]);
  });

  it("does not double count a match that appears in several rows", () => {
    const jun = session(1, "2025-06-10T12:00:00Z");
    const played = [row(1, jun), row(1, jun)];
    expect(trendByMonth(played, [row(1, jun)])).toEqual([
      { month: "2025-06", matches: 1, wins: 1, winRate: 1 },
    ]);
  });
});

describe("bestSessions", () => {
  it("returns no sessions for empty input", () => {
    expect(bestSessions([])).toEqual([]);
  });

  it("ranks sessions by wins and keeps the top three by default", () => {
    const a = session(1, "2025-01-01T12:00:00Z", mk8, "A");
    const b = session(2, "2025-02-01T12:00:00Z", rl, "B");
    const c = session(3, "2025-03-01T12:00:00Z", mk8, "C");
    const d = session(4, "2025-04-01T12:00:00Z", mk8, "D");
    const wins = [
      row(1, a),
      row(2, b),
      row(3, b),
      row(4, b),
      row(5, c),
      row(6, c),
      row(7, d),
    ];

    const result = bestSessions(wins);
    expect(result).toEqual([
      { sessionId: 2, sessionName: "B", gameName: rl, date: b.date, wins: 3 },
      { sessionId: 3, sessionName: "C", gameName: mk8, date: c.date, wins: 2 },
      { sessionId: 4, sessionName: "D", gameName: mk8, date: d.date, wins: 1 },
    ]);
  });

  it("breaks ties by most recent session date", () => {
    const older = session(1, "2025-01-01T12:00:00Z", mk8, "Older");
    const newer = session(2, "2025-06-01T12:00:00Z", mk8, "Newer");
    const result = bestSessions([row(1, older), row(2, newer)], 1);
    expect(result.map((s) => s.sessionName)).toEqual(["Newer"]);
  });

  it("respects a custom limit", () => {
    const a = session(1, "2025-01-01T12:00:00Z");
    const b = session(2, "2025-02-01T12:00:00Z");
    expect(bestSessions([row(1, a), row(2, b)], 1)).toHaveLength(1);
  });
});
