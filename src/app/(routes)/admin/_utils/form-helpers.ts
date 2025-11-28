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
  StatName.MR_MVP,
  StatName.MR_SVP,
] as const;

// Session Schema Definitions
const sessionIdSchema = z.number().optional();
const gameSchema = z.union([
  z.literal([
    "Rocket League",
    "Call of Duty",
    "Mario Kart 8",
    "Lethal Company",
    "Speedrunners",
    "Marvel Rivals",
  ]),
  z.string().min(1, "Game is required"),
]);
const sessionNameSchema = z
  .string()
  .trim()
  .min(1, "Session name is required")
  .max(100)
  .readonly();
// TODO Add logic to surface error since other fields aren't being shown
const sessionUrlSchema = z
  .url("Session URL must be a valid URL")
  .toLowerCase()
  .trim()
  .min(1, "Session URL is required")
  .startsWith("https://www.youtube.com", "Please paste in a valid youtube url.")
  .max(100);
const videoIdSchema = z.string().trim().min(1).readonly();
const dateSchema = z.date({ error: "Date is required" }).readonly();
const thumbnailSchema = z.string().trim().min(1).readonly();

// ! End of Session Schema Definitions

export const playerSchema = z.object({
  playerId: z.int(),
  playerName: z.literal([
    "Mark",
    "Dylan",
    "Ben",
    "Lee",
    "Des",
    "John",
    "Aff",
    "Ipi",
  ]),
});
const playersSchema = z
  .array(playerSchema)
  .nonempty("At least one player is required");

// Stat Schema Definitions

// ? Rocket League
const rocketLeagueStats = z.object({
  statId: z.int().min(1, "StatId is required"),
  stat: z.literal([
    StatName.RL_GOALS,
    StatName.RL_ASSISTS,
    StatName.RL_SAVES,
    StatName.RL_SHOTS,
    StatName.RL_SCORE,
  ]),
  statValue: z
    .string()
    .trim()
    .min(1, "Required")
    .regex(/^\d+$/, "Stat value must be a number")
    .transform((val) => String(parseInt(val) || 0)),
});

// ? Mario Kart 8

const marioKart8Stats = z.object({
  statId: z.int().min(1, "StatId is required"),
  stat: z.literal(StatName.MK8_POS),
  statValue: z
    .string()
    .trim()
    .min(1, "Required")
    .regex(/^\d+$/, "Stat value must be a number")
    .transform((val) => String(parseInt(val) || 0)),
});

// ? COD Gun Game Stats

const codStats = z.object({
  statId: z.string().trim().min(1, "StatId is required"),
  stat: z.literal([
    StatName.COD_KILLS,
    StatName.COD_DEATHS,
    StatName.COD_POS,
    StatName.COD_SCORE,
    StatName.COD_MELEES,
  ]),

  // CoD
  statValue: z
    .string()
    .trim()
    .min(1, "Required")
    .regex(/^\d+$/, "Stat value must be a number")
    .transform((val) => String(parseInt(val) || 0)),
});

const marvelRivalsStats = z
  .object({
    statId: z.int().min(1, "StatId is required"),
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

const matchesSchema = z
  .array(matchSchema)
  .nonempty("At least one match is required");

const setSchema = z.object({
  setId: z.int(),
  setWinners: z
    .array(playerSchema)
    .nonempty("At least one set winner is required"),
  matches: matchesSchema,
});

const setsSchema = z.array(setSchema).nonempty("At least one set is required");

// Base schema for common fields
const baseSessionSchema = z.object({
  sessionId: sessionIdSchema,
  game: gameSchema,
  sessionName: sessionNameSchema,
  sessionUrl: sessionUrlSchema,
  videoId: videoIdSchema,
  date: dateSchema,
  thumbnail: thumbnailSchema,
  players: playersSchema,
  sets: setsSchema,
});

const rocketLeagueSchema = baseSessionSchema.extend({
  game: z.literal("Rocket League"),
  sets: z
    .array(
      setSchema.extend({
        matches: z.array(
          matchSchema.check((ctx) => {
            const match = ctx.value;
            let winningTeam = 0;
            let losingTeam = 0;

            match.playerSessions.forEach((ps) => {
              const onWinningTeam = match.matchWinners.some(
                (mw) => mw.playerId === ps.playerId,
              );
              ps.playerStats.forEach((stat) => {
                if (stat.stat === StatName.RL_GOALS) {
                  if (onWinningTeam) winningTeam += Number(stat.statValue) || 0;
                  else losingTeam += Number(stat.statValue) || 0;
                }
              });
            });

            // Rule: Winning team must have more goals than losing team
            if (winningTeam <= losingTeam)
              ctx.issues.push({
                code: "custom",
                input: ctx.value,
                message: "Winning team must have more goals than losing team.",
              });
          }),
        ),
      }),
    )
    .nonempty(),
});

const marioKart8MatchSchema = baseSessionSchema.extend({
  game: z.literal("Mario Kart 8"),
  sets: z.array(
    setSchema.extend({
      matches: z.array(
        matchSchema.check((ctx) => {
          const match = ctx.value;
          // Rule 1: Check if exactly one winner is selected
          if (match.matchWinners.length !== 1)
            ctx.issues.push({
              code: "custom",
              message: "A match must have exactly one winner.",
              input: ctx.value,
            });

          const firstPlace: number[] = [];

          const winnerId = match.matchWinners.at(0)?.playerId;
          let highestPosition = [0, Infinity] as [number, number]; // playerId, position
          match.playerSessions.forEach((ps) => {
            ps.playerStats.forEach((stat) => {
              if (stat.stat === StatName.MK8_POS) {
                const position = parseInt(stat.statValue);
                if (position === 1) firstPlace.push(ps.playerId);
                if (position < highestPosition[1])
                  highestPosition = [ps.playerId, position];
              }
            });
          });

          // Rule 2: Check if there is more than one first place player
          if (firstPlace.length > 1) {
            ctx.issues.push({
              code: "custom",
              message: "There can be only one 1st place player.",
              input: ctx.value,
            });
          }
          // Rule 3: Check if the winner has the highest position
          if (highestPosition[0] !== winnerId)
            ctx.issues.push({
              code: "custom",
              message:
                "The 1st place player and match winner must have the highest position.",
              input: ctx.value,
            });
        }),
      ),
    }),
  ),
});

const lethalCompanySchema = baseSessionSchema.extend({
  game: z.literal("Lethal Company"),
});

const speedrunnersSchema = baseSessionSchema.extend({
  game: z.literal("Speedrunners"),
});

const marvelRivalsSchema = baseSessionSchema.extend({
  game: z.literal("Marvel Rivals"),
  sets: z.array(
    setSchema.extend({
      matches: z.array(
        matchSchema
          .extend({
            matchWinners: z.array(playerSchema),
          })
          .check((ctx) => {
            const match = ctx.value;
            let mvpCount = 0;
            let svpCount = 0;
            let mvpPlayerId: number | null = null;
            let svpPlayerId: number | null = null;

            // Count MVP and SVP stats across all player sessions
            match.playerSessions.forEach((ps) => {
              ps.playerStats.forEach((stat) => {
                if (stat.stat === StatName.MR_MVP && stat.statValue === "1") {
                  mvpCount++;
                  mvpPlayerId = ps.playerId;
                }
                if (stat.stat === StatName.MR_SVP && stat.statValue === "1") {
                  svpCount++;
                  svpPlayerId = ps.playerId;
                }
              });
            });

            // Rule 1: Only one MVP or SVP allowed per match (not both on same player)
            if (mvpCount + svpCount > 1) {
              ctx.issues.push({
                code: "custom",
                message: "Only one player can have MVP or SVP per match.",
                input: ctx.value,
              });
            }

            // Rule 2: MVP must be a match winner
            if (
              mvpCount === 1 &&
              !match.matchWinners.some((w) => w.playerId === mvpPlayerId)
            ) {
              ctx.issues.push({
                code: "custom",
                message: "MVP must be assigned to a match winner.",
                input: ctx.value,
              });
            }

            // Rule 3: SVP must NOT be a match winner
            if (
              svpCount === 1 &&
              match.matchWinners.some((w) => w.playerId === svpPlayerId)
            ) {
              ctx.issues.push({
                code: "custom",
                message: "SVP must be assigned to a non-winning player.",
                input: ctx.value,
              });
            }
          }),
      ),
    }),
  ),
});

const codSchema = baseSessionSchema.extend({
  game: z.literal("Call of Duty"),
  sets: z.array(
    setSchema.extend({
      matches: z.array(
        matchSchema.check((ctx) => {
          const match = ctx.value;
          // Rule 1: Check if exactly one winner is selected
          if (match.matchWinners.length !== 1)
            ctx.issues.push({
              code: "custom",
              message: "A match must have exactly one winner.",
              path: ["matchWinners"],
              input: ctx.value,
            });

          const firstPlace: number[] = [];

          const winnerId = match.matchWinners.at(0)?.playerId;
          const winner = { winnerId, score: 0, position: 0 };
          let highestScoreOverall = 0;

          match.playerSessions.forEach((ps) => {
            ps.playerStats.forEach((stat) => {
              if (stat.stat === StatName.COD_SCORE) {
                const score = parseInt(stat.statValue) || 0;
                highestScoreOverall = Math.max(highestScoreOverall, score);
                if (ps.playerId === winnerId) {
                  winner.score = score;
                }
              }
              if (
                stat.stat === StatName.COD_POS &&
                parseInt(stat.statValue) === 1
              ) {
                winner.position = parseInt(stat.statValue) || 0;
                firstPlace.push(ps.playerId);
              }
            });
          });

          // Rule 2: Ensure there's only one first place player
          if (firstPlace.length > 1)
            ctx.issues.push({
              code: "custom",
              message: "There can be only one 1st place player.",
              input: ctx.value,
            });

          // Rule 3: Ensure the match winner has the highest score
          if (winner.score < highestScoreOverall)
            ctx.issues.push({
              code: "custom",
              message: "The match winner must have the highest score.",
              path: ["matchWinners"],
              input: ctx.value,
            });

          // Rule 4: Ensure the match winner is in first place
          if (!firstPlace.includes(winnerId || Infinity))
            ctx.issues.push({
              code: "custom",
              message: "The match winner must be in first place.",
              path: ["matchWinners"],
              input: ctx.value,
            });
        }),
      ),
    }),
  ),
});

// ! End of Game specific schemas

// Combined schema with discriminated union
export const formSchema = z.discriminatedUnion("game", [
  codSchema,
  rocketLeagueSchema,
  marioKart8MatchSchema,
  lethalCompanySchema,
  speedrunnersSchema,
  marvelRivalsSchema,
]);

// Define types based on the Zod schema
export type FormValues = z.infer<typeof formSchema>;

// Extract from a specific schema to avoid union indexing issues
type BaseGameForm = Extract<FormValues, { game: "Call of Duty" }>;

// Derive specific types from the base schema
export type Match = BaseGameForm["sets"][number]["matches"][number];
export type MatchWinners = Match["matchWinners"];
export type PlayerSessions = Match["playerSessions"];
export type SetWinners = BaseGameForm["sets"][number]["setWinners"];
