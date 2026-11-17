import { formSchema, GAME_STATS, type FormValues } from "./form-helpers";
import { STAT_CONFIGS, statRollup } from "@/lib/stat-configs";
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
  it.each([
    ["Lethal Company", { LC_DEATHS: "2" }],
    ["SpeedRunners", { SR_WINS: "3", SR_SETS: "1", SR_POS: "2" }],
  ] as [string, StatLine][])("%s accepts its own stats and any winner, but requires one", (game, stats) => {
    const match: Match = { matchWinners: [DYLAN], playerSessions: [plays(MARK, stats)] };

    expect(problems(session(game, match))).toEqual([]);
    expect(problems(session(game, { ...match, matchWinners: [] }))).toEqual([
      ["At least one match winner is required", [...MATCH_PATH, "matchWinners"]],
    ]);
  });

  it("Marvel Rivals accepts a match with no winner", () => {
    const match: Match = { matchWinners: [], playerSessions: [plays(MARK, { MR_KILLS: "12" })] };

    expect(problems(session("Marvel Rivals", match))).toEqual([]);
  });

  it.each(["Golf With Friends", "Speedrunners"])("rejects %s, which is not a game's name in the database", (game) => {
    const match: Match = { matchWinners: [MARK], playerSessions: [plays(MARK, { SR_WINS: "5" })] };

    expect(problems(session(game, match))).not.toEqual([]);
  });
});

describe("a session only records its own game's stats", () => {
  const PLAYER_PATH = [...MATCH_PATH, "playerSessions", 0, "playerStats"];
  const check = (game: string, stats: StatLine) =>
    problems(session(game, { matchWinners: [MARK], playerSessions: [plays(MARK, stats)] }));

  it.each([
    ["Call of Duty", "RL_GOALS"],
    ["Rocket League", "MK8_POS"],
    ["Mario Kart 8", "COD_KILLS"],
    ["Lethal Company", "SR_WINS"],
    ["SpeedRunners", "LC_DEATHS"],
    ["Marvel Rivals", "COD_SCORE"],
  ] as [string, StatName][])("%s rejects %s", (game, stat) => {
    expect(check(game, { [stat]: "1" })).toContainEqual([
      `${stat} is not a ${game} stat.`,
      [...PLAYER_PATH, 0],
    ]);
  });

  it("points at each stat line that does not belong", () => {
    const stats = { MR_KILLS: "4", RL_SAVES: "1", MR_DEATHS: "2", COD_POS: "1" };

    expect(check("Marvel Rivals", stats)).toEqual([
      ["RL_SAVES is not a Marvel Rivals stat.", [...PLAYER_PATH, 1]],
      ["COD_POS is not a Marvel Rivals stat.", [...PLAYER_PATH, 3]],
    ]);
  });

  it("lists the same stats per game as the stat configs, without the per-day counters", () => {
    const GAME_IDS: Record<keyof typeof GAME_STATS, number> = {
      "Mario Kart 8": 1,
      "Rocket League": 2,
      "Call of Duty": 3,
      "Lethal Company": 4,
      SpeedRunners: 5,
      "Marvel Rivals": 6,
    };

    for (const [game, gameId] of Object.entries(GAME_IDS)) {
      const configured = Object.values(STAT_CONFIGS)
        .filter((config) => config.gameId === gameId && statRollup(config) !== "skip")
        .map((config) => config.name);

      expect([...GAME_STATS[game as keyof typeof GAME_STATS]].sort(), game).toEqual(configured.sort());
    }
  });
});

describe("stat values", () => {
  const STAT_PATH = [...MATCH_PATH, "playerSessions", 0, "playerStats", 0, "statValue"];

  /** A match that is valid for the stat's game whatever the stat under test holds. */
  const CASES: Record<string, { game: string; rest: StatLine; winners: Player[] }> = {
    RL_SAVES: { game: "Rocket League", rest: { RL_GOALS: "1" }, winners: [MARK] },
    MK8_POS: { game: "Mario Kart 8", rest: {}, winners: [MARK] },
    COD_KILLS: { game: "Call of Duty", rest: { COD_SCORE: "9", COD_POS: "1" }, winners: [MARK] },
    LC_DEATHS: { game: "Lethal Company", rest: {}, winners: [MARK] },
    SR_SETS: { game: "SpeedRunners", rest: {}, winners: [MARK] },
    MR_KILLS: { game: "Marvel Rivals", rest: {}, winners: [] },
    MR_TRIPLE_KILL: { game: "Marvel Rivals", rest: {}, winners: [] },
  };
  const input = (stat: string, value: string) => {
    const { game, rest, winners } = CASES[stat];
    // The stat under test is listed first, so it is playerStats[0].
    return session(game, {
      matchWinners: winners,
      playerSessions: [plays(MARK, { [stat]: value, ...rest } as StatLine)],
    });
  };
  /** Problems reported on the stat's value, ignoring any match rule it trips. */
  const valueProblems = (stat: string, value: string) =>
    problems(input(stat, value)).filter(([, path]) => String(path) === String(STAT_PATH));
  const parsedValue = (stat: string, value: string) =>
    formSchema.parse(input(stat, value)).sets[0].matches[0].playerSessions[0].playerStats[0].statValue;

  it.each(["RL_SAVES", "MK8_POS", "COD_KILLS", "LC_DEATHS", "SR_SETS", "MR_KILLS"])(
    "%s must be a whole number",
    (stat) => {
      expect(valueProblems(stat, "1.5")).toEqual([["Stat value must be a number", STAT_PATH]]);
      expect(valueProblems(stat, "twelve")).toEqual([["Stat value must be a number", STAT_PATH]]);
      expect(parsedValue(stat, " 001 ")).toBe("1");
    },
  );

  it.each(["RL_SAVES", "MK8_POS", "COD_KILLS", "LC_DEATHS", "SR_SETS"])(
    "an empty %s is required (and also reported as not a number)",
    (stat) => {
      expect(valueProblems(stat, "  ")).toEqual([
        ["Required", STAT_PATH],
        ["Stat value must be a number", STAT_PATH],
      ]);
    },
  );

  it("an empty required Marvel Rivals stat is required", () => {
    expect(valueProblems("MR_KILLS", "")).toEqual([["Required", STAT_PATH]]);
  });

  it("lets a Marvel Rivals medal stat be left empty, stored as 0", () => {
    expect(parsedValue("MR_TRIPLE_KILL", "")).toBe("0");
    expect(valueProblems("MR_TRIPLE_KILL", "many")).toEqual([
      ["Stat value must be a number", STAT_PATH],
    ]);
  });

  it("rejects a per-day counter, which the form never records", () => {
    const withDay = session("Rocket League", {
      matchWinners: [MARK],
      playerSessions: [plays(MARK, { RL_GOALS: "1", RL_DAY: "1" } as StatLine)],
    });

    expect(problems(withDay)).not.toEqual([]);
  });

  it("requires at least one stat per player", () => {
    const empty = session("Marvel Rivals", { matchWinners: [], playerSessions: [plays(MARK, {})] });

    expect(problems(empty)).toEqual([
      ["At least one player stat is required", [...MATCH_PATH, "playerSessions", 0, "playerStats"]],
    ]);
  });
});

describe("thumbnail", () => {
  const withThumbnail = (thumbnail: string) => ({
    ...session("Marvel Rivals", { matchWinners: [], playerSessions: [plays(MARK, { MR_KILLS: "1" })] }),
    thumbnail,
  });

  it("accepts a YouTube thumbnail", () => {
    expect(problems(withThumbnail("https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"))).toEqual([]);
  });

  // next/image throws while rendering any host that next.config.ts doesn't allow.
  it.each([
    ["another host", "https://example.com/thumbnail.jpg"],
    ["a lookalike host", "https://i.ytimg.com.evil.test/vi/x/hqdefault.jpg"],
    ["plain http", "http://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"],
    ["something that is not a URL", "thumbnail.jpg"],
  ])("rejects %s", (_label, thumbnail) => {
    expect(problems(withThumbnail(thumbnail))).toEqual([
      ["Thumbnail must be a YouTube image.", ["thumbnail"]],
    ]);
  });
});
