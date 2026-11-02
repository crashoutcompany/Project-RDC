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

  it("gives totals and per-match averages for number stats", () => {
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
        kind: "perMatch",
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
        kind: "perMatch",
      },
    ]);
  });

  it("averages accuracy instead of summing it", () => {
    const [game] = statBreakdown([
      stat("Marvel Rivals", "MR_ACCURACY", "40"),
      stat("Marvel Rivals", "MR_ACCURACY", "60"),
    ]);
    expect(game.stats).toEqual([
      {
        statName: "MR_ACCURACY",
        displayName: "Accuracy",
        value: 50,
        kind: "average",
      },
    ]);
  });

  it("skips stats whose rollup is skip (Days Played)", () => {
    expect(
      statBreakdown([stat(mk8, "MK8_DAY", "1"), stat(rl, "RL_DAY", "2")]),
    ).toEqual([]);
  });

  it("omits a game whose values all fail to parse", () => {
    const result = statBreakdown([
      stat(mk8, "MK8_POS", "x"),
      stat(rl, "RL_GOALS", "3"),
    ]);
    expect(result.map((g) => g.gameName)).toEqual([rl]);
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
    expect(bestSessions([], [])).toEqual([]);
  });

  it("ranks by win rate, not raw wins", () => {
    const long = session(1, "2025-01-01T12:00:00Z", mk8, "Long");
    const short = session(2, "2025-02-01T12:00:00Z", rl, "Short");
    // Long: 3 wins of 10 matches. Short: 2 wins of 2 matches.
    const played = [
      row(1, long),
      row(2, long),
      row(3, long),
      row(4, long),
      row(5, long),
      row(6, long),
      row(7, long),
      row(8, long),
      row(9, long),
      row(10, long),
      row(11, short),
      row(12, short),
    ];
    const wins = [
      row(1, long),
      row(2, long),
      row(3, long),
      row(11, short),
      row(12, short),
    ];

    const result = bestSessions(played, wins);
    expect(result.map((s) => s.sessionName)).toEqual(["Short", "Long"]);
    expect(result[0]).toEqual({
      sessionId: 2,
      sessionName: "Short",
      gameName: rl,
      date: short.date,
      wins: 2,
      matches: 2,
      rate: 1,
    });
    expect(result[1]).toMatchObject({ wins: 3, matches: 10, rate: 0.3 });
  });

  it("counts a match once even when it is in both lists", () => {
    const a = session(1, "2025-01-01T12:00:00Z");
    const result = bestSessions([row(1, a), row(2, a)], [row(1, a)]);
    expect(result).toMatchObject([{ wins: 1, matches: 2, rate: 0.5 }]);
  });

  it("counts a win as a played match when it is missing from the played list", () => {
    const a = session(1, "2025-01-01T12:00:00Z");
    expect(bestSessions([], [row(1, a)])).toMatchObject([
      { wins: 1, matches: 1, rate: 1 },
    ]);
  });

  it("excludes sessions with no wins", () => {
    const a = session(1, "2025-01-01T12:00:00Z");
    expect(bestSessions([row(1, a), row(2, a)], [])).toEqual([]);
  });

  it("breaks rate ties by wins, then by most recent date", () => {
    const older = session(1, "2025-01-01T12:00:00Z", mk8, "Older");
    const newer = session(2, "2025-06-01T12:00:00Z", mk8, "Newer");
    const big = session(3, "2024-01-01T12:00:00Z", mk8, "Big");
    const result = bestSessions(
      [row(1, older), row(2, newer), row(3, big), row(4, big)],
      [row(1, older), row(2, newer), row(3, big), row(4, big)],
    );
    expect(result.map((s) => s.sessionName)).toEqual(["Big", "Newer", "Older"]);

    const tie = bestSessions(
      [row(1, older), row(2, newer)],
      [row(1, older), row(2, newer)],
      1,
    );
    expect(tie.map((s) => s.sessionName)).toEqual(["Newer"]);
  });

  it("keeps the top three by default and respects a custom limit", () => {
    const sessions = [1, 2, 3, 4].map((id) =>
      session(id, `2025-0${id}-01T12:00:00Z`),
    );
    const wins = sessions.map((s) => row(s.sessionId, s));
    expect(bestSessions(wins, wins)).toHaveLength(3);
    expect(bestSessions(wins, wins, 1)).toHaveLength(1);
  });
});
