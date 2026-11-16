import { StatName } from "@/lib/stat-names";
import { z } from "zod/v4";

// Marvel Rivals optional stats (expandable stats that can be left empty)
const MARVEL_RIVALS_OPTIONAL_STATS = [
  StatName.MR_TRIPLE_KILL,
  StatName.MR_QUADRA_KILL,
  StatName.MR_PENTA_KILL,
  StatName.MR_HEXA_KILL,
  StatName.MR_HIGHEST_DMG,
  StatName.MR_HIGHEST_DMG_BLOCKED,
  StatName.MR_MOST_HEALING,
  StatName.MR_MOST_ASSISTS,
] as const;

// Session Schema Definitions
const sessionIdSchema = z.number().optional();
const sessionNameSchema = z
  .string()
  .trim()
  .min(1, "Session name is required")
  .max(100)
  .readonly();
// TODO Add logic to surface error since other fields aren't being shown
const YOUTUBE_WATCH_HOSTS = new Set(["www.youtube.com", "youtube.com"]);

/**
 * YouTube video IDs are case-sensitive. Validate the host without
 * lowercasing the URL, or stored session links point at the wrong video.
 */
const sessionUrlSchema = z
  .url("Session URL must be a valid URL")
  .trim()
  .min(1, "Session URL is required")
  .max(100)
  .check((ctx) => {
    try {
      const parsed = new URL(ctx.value);
      const host = parsed.hostname.toLowerCase();
      if (parsed.protocol !== "https:" || !YOUTUBE_WATCH_HOSTS.has(host))
        ctx.issues.push({
          code: "custom",
          input: ctx.value,
          message: "Please paste in a valid youtube url.",
        });
    } catch {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        message: "Please paste in a valid youtube url.",
      });
    }
  });
const videoIdSchema = z.string().trim().min(1).readonly();
const dateSchema = z.date({ error: "Date is required" }).readonly();
const thumbnailSchema = z.string().trim().min(1).readonly();

// ! End of Session Schema Definitions

/**
 * A reference to a player. Identity is the `playerId`; the name is carried
 * for display. Whether a reference is allowed is decided against the
 * session's own `players` (see `formSchema`), not a fixed list of members, so
 * a player added from the admin page works as soon as they exist.
 */
export const playerSchema = z.object({
  playerId: z.int().positive(),
  playerName: z.string().trim().min(1, "Player name is required"),
});
const playersSchema = z
  .array(playerSchema)
  .nonempty("At least one player is required");

// Stat Schema Definitions

// Prisma ids are numbers; the edit/approve pages (and some restored drafts)
// historically stringified them. Coerce so neither path fails validation.
const statIdSchema = z.coerce.number().int().min(1, "StatId is required");

/** A whole-number stat value, stored as its canonical string ("007" -> "7"). */
const numericStatValueSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .regex(/^\d+$/, "Stat value must be a number")
  .transform((val) => String(parseInt(val) || 0));

/** A stat line for one of `stats`, with a whole-number value. */
const numericStats = <const Stats extends readonly [StatName, ...StatName[]]>(
  stats: Stats,
) =>
  z.object({
    statId: statIdSchema,
    stat: z.literal(stats),
    statValue: numericStatValueSchema,
  });

const rocketLeagueStats = numericStats([
  StatName.RL_GOALS,
  StatName.RL_ASSISTS,
  StatName.RL_SAVES,
  StatName.RL_SHOTS,
  StatName.RL_SCORE,
]);

const marioKart8Stats = numericStats([StatName.MK8_POS]);

const codStats = numericStats([
  StatName.COD_KILLS,
  StatName.COD_DEATHS,
  StatName.COD_POS,
  StatName.COD_SCORE,
  StatName.COD_MELEES,
]);

const marvelRivalsStats = z
  .object({
    statId: statIdSchema,
    stat: z.literal([
      StatName.MR_KILLS,
      StatName.MR_DEATHS,
      StatName.MR_ASSISTS,
      StatName.MR_TRIPLE_KILL,
      StatName.MR_QUADRA_KILL,
      StatName.MR_PENTA_KILL,
      StatName.MR_HEXA_KILL,
      StatName.MR_MOST_KILLS,
      StatName.MR_HIGHEST_DMG,
      StatName.MR_HIGHEST_DMG_BLOCKED,
      StatName.MR_MOST_HEALING,
      StatName.MR_MOST_ASSISTS,
      StatName.MR_FINAL_HITS,
      StatName.MR_DMG,
      StatName.MR_DMG_BLOCKED,
      StatName.MR_HEALING,
      StatName.MR_ACCURACY,
    ]),
    statValue: z.string().trim(),
  })
  .superRefine((data, ctx) => {
    const isOptionalStat = MARVEL_RIVALS_OPTIONAL_STATS.includes(
      data.stat as (typeof MARVEL_RIVALS_OPTIONAL_STATS)[number],
    );

    // If the stat is optional and empty, that's fine - just set to "0"
    if (isOptionalStat && data.statValue === "") {
      return;
    }

    // For required stats or non-empty optional stats, validate
    if (!isOptionalStat && data.statValue === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Required",
        path: ["statValue"],
      });
      return;
    }

    // Validate that it's a number
    if (!/^\d+$/.test(data.statValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stat value must be a number",
        path: ["statValue"],
      });
    }
  })
  .transform((data) => ({
    ...data,
    statValue: String(parseInt(data.statValue) || 0),
  }));

// Stat Schema Union
const statSchema = z.discriminatedUnion("stat", [
  rocketLeagueStats,
  marioKart8Stats,
  codStats,
  marvelRivalsStats,
]);

// ! End of Stat Schema Definitions

const playerSessionSchema = z.object({
  playerId: z.int(),
  playerSessionName: z.string().trim().min(1),
  playerStats: z
    .array(statSchema)
    .nonempty("At least one player stat is required"),
});

const matchSchema = z.object({
  matchWinners: z
    .array(playerSchema)
    .nonempty("At least one match winner is required"),
  playerSessions: z
    .array(playerSessionSchema)
    .nonempty("At least one player session is required"),
});

// `matches` is added per game by `gameSessionSchema`.
const setSchema = z.object({
  setId: z.int(),
  setWinners: z
    .array(playerSchema)
    .nonempty("At least one set winner is required"),
});

// Fields every game shares; `game` and `sets` come from `gameSessionSchema`.
const baseSessionSchema = z.object({
  sessionId: sessionIdSchema,
  sessionName: sessionNameSchema,
  sessionUrl: sessionUrlSchema,
  videoId: videoIdSchema,
  date: dateSchema,
  thumbnail: thumbnailSchema,
  players: playersSchema,
  // Entered manually by admins; may be empty (a day with no recorded winner).
  dayWinners: z.array(playerSchema),
});

// Game specific rules

type MatchValues = z.infer<typeof matchSchema>;
type MatchIssue = { message: string; path?: string[] };

/** What is wrong with a match under one game's rules; empty when it is valid. */
type MatchRule = (match: MatchValues) => MatchIssue[];

/** Every value a match records for `stat`, with the player it belongs to. */
const statValues = (match: MatchValues, stat: StatName) =>
  match.playerSessions.flatMap((ps) =>
    ps.playerStats
      .filter((playerStat) => playerStat.stat === stat)
      .map((playerStat) => ({
        playerId: ps.playerId,
        value: playerStat.statValue,
      })),
  );

const rocketLeagueMatchRule: MatchRule = (match) => {
  let winningTeam = 0;
  let losingTeam = 0;
  for (const { playerId, value } of statValues(match, StatName.RL_GOALS)) {
    const goals = Number(value) || 0;
    if (match.matchWinners.some((mw) => mw.playerId === playerId))
      winningTeam += goals;
    else losingTeam += goals;
  }

  return winningTeam <= losingTeam
    ? [{ message: "Winning team must have more goals than losing team." }]
    : [];
};

const marioKart8MatchRule: MatchRule = (match) => {
  const issues: MatchIssue[] = [];
  if (match.matchWinners.length !== 1)
    issues.push({ message: "A match must have exactly one winner." });

  const positions = statValues(match, StatName.MK8_POS).map((stat) => ({
    playerId: stat.playerId,
    position: parseInt(stat.value),
  }));
  const firstPlace = positions.filter((p) => p.position === 1);
  // The earliest player keeps a tie for the best position.
  const best = positions.reduce(
    (best, current) => (current.position < best.position ? current : best),
    { playerId: 0, position: Infinity },
  );

  if (firstPlace.length > 1)
    issues.push({ message: "There can be only one 1st place player." });
  if (best.playerId !== match.matchWinners.at(0)?.playerId)
    issues.push({
      message:
        "The 1st place player and match winner must have the highest position.",
    });
  return issues;
};

const codMatchRule: MatchRule = (match) => {
  const issues: MatchIssue[] = [];
  const path = ["matchWinners"];
  if (match.matchWinners.length !== 1)
    issues.push({ message: "A match must have exactly one winner.", path });

  const winnerId = match.matchWinners.at(0)?.playerId;
  const scores = statValues(match, StatName.COD_SCORE).map((stat) => ({
    playerId: stat.playerId,
    score: parseInt(stat.value) || 0,
  }));
  const highestScore = Math.max(0, ...scores.map((s) => s.score));
  const winnerScore = scores.findLast((s) => s.playerId === winnerId)?.score;
  const firstPlace = statValues(match, StatName.COD_POS)
    .filter((stat) => parseInt(stat.value) === 1)
    .map((stat) => stat.playerId);

  if (firstPlace.length > 1)
    issues.push({ message: "There can be only one 1st place player." });
  if ((winnerScore ?? 0) < highestScore)
    issues.push({
      message: "The match winner must have the highest score.",
      path,
    });
  if (!firstPlace.includes(winnerId || Infinity))
    issues.push({ message: "The match winner must be in first place.", path });
  return issues;
};

type GameRules = {
  /** Checks each match once its fields are valid. */
  matchRule?: MatchRule;
  /** A match may be recorded with no winner. */
  matchWinnersOptional?: boolean;
};

/** Every game the form accepts, and what it requires of a match. */
const GAME_RULES = {
  "Call of Duty": { matchRule: codMatchRule },
  "Rocket League": { matchRule: rocketLeagueMatchRule },
  "Mario Kart 8": { matchRule: marioKart8MatchRule },
  "Lethal Company": {},
  Speedrunners: {},
  "Marvel Rivals": { matchWinnersOptional: true },
} satisfies Record<string, GameRules>;

type GameName = keyof typeof GAME_RULES;

/** The session schema for one game: the base fields plus that game's rules. */
const gameSessionSchema = <Game extends GameName>(game: Game) => {
  const { matchRule, matchWinnersOptional }: GameRules = GAME_RULES[game];

  const match = matchWinnersOptional
    ? matchSchema.extend({ matchWinners: z.array(playerSchema) })
    : matchSchema;
  const checkedMatch = matchRule
    ? match.check((ctx) => {
        // Zod prepends the parent path in place, so each issue gets its own.
        for (const { message, path } of matchRule(ctx.value))
          ctx.issues.push({
            code: "custom",
            input: ctx.value,
            message,
            ...(path && { path: [...path] }),
          });
      })
    : match;

  return baseSessionSchema.extend({
    game: z.literal(game),
    sets: z
      .array(
        setSchema.extend({
          matches: z
            .array(checkedMatch)
            .nonempty("At least one match is required"),
        }),
      )
      .nonempty("At least one set is required"),
  });
};

// ! End of Game specific schemas

// Combined schema with discriminated union
export const formSchema = z
  .discriminatedUnion("game", [
    gameSessionSchema("Call of Duty"),
    gameSessionSchema("Rocket League"),
    gameSessionSchema("Mario Kart 8"),
    gameSessionSchema("Lethal Company"),
    gameSessionSchema("Speedrunners"),
    gameSessionSchema("Marvel Rivals"),
  ])
  // Everyone the session mentions must be one of its players, by playerId.
  .check((ctx) => {
    const { players, dayWinners, sets } = ctx.value;
    const sessionPlayers = new Map(
      players.map((player) => [player.playerId, player.playerName]),
    );
    const notASessionPlayer = (name: string, path: PropertyKey[]) =>
      ctx.issues.push({
        code: "custom",
        message: `${name} is not a session player`,
        input: ctx.value,
        path,
      });
    // A winner must also carry the name the session knows that player by.
    const checkWinners = (
      winners: z.infer<typeof playerSchema>[],
      path: PropertyKey[],
    ) =>
      winners.forEach((winner, index) => {
        if (sessionPlayers.get(winner.playerId) !== winner.playerName)
          notASessionPlayer(winner.playerName, [...path, index]);
      });

    checkWinners(dayWinners, ["dayWinners"]);
    sets.forEach((set, setIndex) => {
      const setPath = ["sets", setIndex];
      checkWinners(set.setWinners, [...setPath, "setWinners"]);

      set.matches.forEach((match, matchIndex) => {
        const matchPath = [...setPath, "matches", matchIndex];
        checkWinners(match.matchWinners, [...matchPath, "matchWinners"]);

        match.playerSessions.forEach((playerSession, index) => {
          if (!sessionPlayers.has(playerSession.playerId))
            notASessionPlayer(playerSession.playerSessionName, [
              ...matchPath,
              "playerSessions",
              index,
            ]);
        });
      });
    });
  });

// Define types based on the Zod schema
export type FormValues = z.infer<typeof formSchema>;

// Extract from a specific schema to avoid union indexing issues
type BaseGameForm = Extract<FormValues, { game: "Call of Duty" }>;

// Derive specific types from the base schema
export type Match = BaseGameForm["sets"][number]["matches"][number];
export type MatchWinners = Match["matchWinners"];
export type PlayerSessions = Match["playerSessions"];
export type SetWinners = BaseGameForm["sets"][number]["setWinners"];
