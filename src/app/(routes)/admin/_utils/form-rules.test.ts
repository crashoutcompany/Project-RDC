import { formSchema, type FormValues } from "./form-helpers";
import { StatName } from "@/lib/stat-names";

const MARK = { playerId: 1, playerName: "Mark" } as const;
const DYLAN = { playerId: 2, playerName: "Dylan" } as const;
const BEN = { playerId: 3, playerName: "Ben" } as const;

type Player = FormValues["players"][number];
type StatLine = Partial<Record<StatName, string>>;

/** One player's stat lines for a match; stat ids just need to be positive. */
const plays = (player: Player, stats: StatLine) => ({
  playerId: player.playerId,
  playerSessionName: player.playerName,
  playerStats: Object.entries(stats).map(([stat, statValue], index) => ({
    statId: index + 1,
    stat,
    statValue,
  })),
});

type Match = { matchWinners: Player[]; playerSessions: ReturnType<typeof plays>[] };

const session = (game: string, match: Match) => ({
  game,
  sessionName: "Game Night",
  sessionUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  videoId: "dQw4w9WgXcQ",
  date: new Date("2025-01-01"),
  players: [MARK, DYLAN, BEN],
  dayWinners: [],
  sets: [{ setId: 1, setWinners: [MARK], matches: [match] }],
});

const MATCH_PATH = ["sets", 0, "matches", 0];

/** Validation problems as [message, path] pairs, in the order they are reported. */
const problems = (input: unknown) => {
  const parsed = formSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => [issue.message, issue.path]);
};

describe("Call of Duty match rules", () => {
  const match = (overrides: Partial<Match> = {}): Match => ({
    matchWinners: [MARK],
    playerSessions: [
      plays(MARK, { COD_SCORE: "2400", COD_POS: "1" }),
      plays(DYLAN, { COD_SCORE: "1800", COD_POS: "2" }),
    ],
    ...overrides,
  });
  const check = (overrides?: Partial<Match>) => problems(session("Call of Duty", match(overrides)));

  it("accepts a single winner who is first with the top score", () => {
    expect(check()).toEqual([]);
  });

  it("requires exactly one winner", () => {
    expect(check({ matchWinners: [MARK, DYLAN] })).toEqual([
      ["A match must have exactly one winner.", [...MATCH_PATH, "matchWinners"]],
    ]);
  });

  it("requires the winner to have the top score and first place", () => {
    expect(check({ matchWinners: [DYLAN] })).toEqual([
      ["The match winner must have the highest score.", [...MATCH_PATH, "matchWinners"]],
      ["The match winner must be in first place.", [...MATCH_PATH, "matchWinners"]],
    ]);
  });

  it("allows only one first-place player", () => {
    const tied = [
      plays(MARK, { COD_SCORE: "2400", COD_POS: "1" }),
      plays(DYLAN, { COD_SCORE: "1800", COD_POS: "1" }),
    ];

    expect(check({ playerSessions: tied })).toEqual([
      ["There can be only one 1st place player.", MATCH_PATH],
    ]);
  });
});

describe("Mario Kart 8 match rules", () => {
  const match = (overrides: Partial<Match> = {}): Match => ({
    matchWinners: [MARK],
    playerSessions: [plays(MARK, { MK8_POS: "1" }), plays(DYLAN, { MK8_POS: "4" })],
    ...overrides,
  });
  const check = (overrides?: Partial<Match>) => problems(session("Mario Kart 8", match(overrides)));

  it("accepts a single winner with the best position", () => {
    expect(check()).toEqual([]);
  });

  it("accepts a winner who was not first, as long as nobody placed better", () => {
    const noFirst = [plays(MARK, { MK8_POS: "2" }), plays(DYLAN, { MK8_POS: "5" })];

    expect(check({ playerSessions: noFirst })).toEqual([]);
  });

  it("requires exactly one winner", () => {
    expect(check({ matchWinners: [MARK, DYLAN] })).toEqual([
      ["A match must have exactly one winner.", MATCH_PATH],
    ]);
  });

  it("requires the winner to have the best position", () => {
    expect(check({ matchWinners: [DYLAN] })).toEqual([
      ["The 1st place player and match winner must have the highest position.", MATCH_PATH],
    ]);
  });

  it("allows only one first-place player", () => {
    const tied = [plays(MARK, { MK8_POS: "1" }), plays(DYLAN, { MK8_POS: "1" })];

    expect(check({ playerSessions: tied })).toEqual([
      ["There can be only one 1st place player.", MATCH_PATH],
    ]);
  });
});

describe("Rocket League match rules", () => {
  const match = (markGoals: string, benGoals: string): Match => ({
    matchWinners: [MARK, DYLAN],
    playerSessions: [
      plays(MARK, { RL_GOALS: markGoals, RL_SAVES: "9" }),
      plays(DYLAN, { RL_GOALS: "1", RL_SAVES: "0" }),
      plays(BEN, { RL_GOALS: benGoals, RL_SAVES: "0" }),
    ],
  });
  const check = (markGoals: string, benGoals: string) =>
    problems(session("Rocket League", match(markGoals, benGoals)));

  it("accepts winners whose goals add up to more than the losers'", () => {
    expect(check("1", "1")).toEqual([]);
  });

  it.each([
    ["a tie", "0", "1"],
    ["fewer goals", "0", "3"],
  ])("rejects winners with %s", (_label, markGoals, benGoals) => {
    expect(check(markGoals, benGoals)).toEqual([
      ["Winning team must have more goals than losing team.", MATCH_PATH],
    ]);
  });
});

describe("games without match rules", () => {
  it.each(["Lethal Company", "Speedrunners"])("%s accepts any winner but requires one", (game) => {
    const match: Match = { matchWinners: [DYLAN], playerSessions: [plays(MARK, { COD_SCORE: "5" })] };

    expect(problems(session(game, match))).toEqual([]);
    expect(problems(session(game, { ...match, matchWinners: [] }))).toEqual([
      ["At least one match winner is required", [...MATCH_PATH, "matchWinners"]],
    ]);
  });

  it("Marvel Rivals accepts a match with no winner", () => {
    const match: Match = { matchWinners: [], playerSessions: [plays(MARK, { MR_KILLS: "12" })] };

    expect(problems(session("Marvel Rivals", match))).toEqual([]);
  });

  it("rejects a game the form does not know", () => {
    const match: Match = { matchWinners: [MARK], playerSessions: [plays(MARK, { COD_SCORE: "5" })] };

    expect(problems(session("Golf With Friends", match))).not.toEqual([]);
  });
});

describe("stat values", () => {
  const STAT_PATH = [...MATCH_PATH, "playerSessions", 0, "playerStats", 0, "statValue"];
  const check = (game: string, stats: StatLine) =>
    problems(session(game, { matchWinners: [], playerSessions: [plays(MARK, stats)] }));
  const parsedValue = (game: string, stats: StatLine) => {
    const parsed = formSchema.parse(session(game, { matchWinners: [], playerSessions: [plays(MARK, stats)] }));
    return parsed.sets[0].matches[0].playerSessions[0].playerStats[0].statValue;
  };

  // Each stat goes in a Marvel Rivals session: that game has no match rules
  // and stats are not tied to the session's game, so only the value is checked.
  it.each([
    ["Rocket League", StatName.RL_SAVES],
    ["Mario Kart 8", StatName.MK8_POS],
    ["Call of Duty", StatName.COD_KILLS],
    ["Marvel Rivals", StatName.MR_KILLS],
  ])("%s stats must be whole numbers", (_game, stat) => {
    expect(check("Marvel Rivals", { [stat]: "1.5" })).toEqual([["Stat value must be a number", STAT_PATH]]);
    expect(check("Marvel Rivals", { [stat]: "twelve" })).toEqual([["Stat value must be a number", STAT_PATH]]);
    expect(parsedValue("Marvel Rivals", { [stat]: " 007 " })).toBe("7");
  });

  it.each([StatName.RL_SAVES, StatName.MK8_POS, StatName.COD_KILLS])(
    "an empty %s is required (and also reported as not a number)",
    (stat) => {
      expect(check("Marvel Rivals", { [stat]: "  " })).toEqual([
        ["Required", STAT_PATH],
        ["Stat value must be a number", STAT_PATH],
      ]);
    },
  );

  it("an empty required Marvel Rivals stat is required", () => {
    expect(check("Marvel Rivals", { MR_KILLS: "" })).toEqual([["Required", STAT_PATH]]);
  });

  it("lets a Marvel Rivals medal stat be left empty, stored as 0", () => {
    expect(parsedValue("Marvel Rivals", { MR_TRIPLE_KILL: "" })).toBe("0");
    expect(check("Marvel Rivals", { MR_TRIPLE_KILL: "many" })).toEqual([
      ["Stat value must be a number", STAT_PATH],
    ]);
  });

  it("rejects a stat the form does not know", () => {
    expect(check("Marvel Rivals", { RL_DAY: "1" } as StatLine)).not.toEqual([]);
  });

  it("requires at least one stat per player", () => {
    expect(check("Marvel Rivals", {})).toEqual([
      ["At least one player stat is required", [...MATCH_PATH, "playerSessions", 0, "playerStats"]],
    ]);
  });
});
