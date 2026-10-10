import { createHash } from "crypto";
import { z } from "zod";
import {
  findPlayer,
  PLAYER_MAPPINGS,
} from "@/app/(routes)/admin/_utils/player-mappings";
import { screenStatConfigs, type GameSpec } from "./scoreboard-specs";

export const MEMBER_NAMES = Object.keys(PLAYER_MAPPINGS) as [string, ...string[]];

/** Member name or gamertag → playerId, using the same lookup as the processors. */
export function resolvePlayerId(nameOrTag: string | null | undefined): number | null {
  if (!nameOrTag) return null;
  return findPlayer(nameOrTag.trim())?.playerId ?? null;
}

/** The JSON every LLM must return, generated from the game's on-screen stats. */
export function buildSchema(spec: GameSpec) {
  const stats = Object.fromEntries(
    screenStatConfigs(spec).map((config) => [
      config.fieldKey,
      z.number().int().nullable().describe(`${config.displayName}; null if unreadable`),
    ]),
  );
  return z.object({
    players: z.array(
      z.object({
        gamertag: z.string().describe("Name exactly as shown on screen"),
        member: z
          .enum(MEMBER_NAMES)
          .nullable()
          .describe("RDC member this gamertag belongs to, or null if not a member"),
        team: z.string().nullable().describe("Team label as shown, e.g. BLUE; null for solo games"),
        stats: z.object(stats),
      }),
    ),
    winning_team: z
      .string()
      .nullable()
      .describe("Team label marked as the winner; null for solo games or if not shown"),
  });
}

export type ScoreboardOutput = z.infer<ReturnType<typeof buildSchema>>;

export const SYSTEM_PROMPT =
  "You transcribe end-of-match scoreboards from video game screenshots into JSON. Copy values exactly as displayed; never guess or compute them.";

/** The user-turn text sent with the image. Identical for every LLM. */
export function buildPrompt(spec: GameSpec): string {
  const columns = screenStatConfigs(spec)
    .map((config) => `- ${config.fieldKey}: ${config.displayName}`)
    .join("\n");
  const members = Object.values(PLAYER_MAPPINGS)
    .map((member) => `- ${member.playerName}: ${member.gamerTags.join(", ")}`)
    .join("\n");

  return [
    `Game: ${spec.displayName}`,
    "",
    spec.screen,
    "",
    "Return one entry in `players` for every player row on the scoreboard, in on-screen order, including players who are not RDC members.",
    "",
    "Stats to read for each row (integers):",
    columns,
    "",
    "RDC members and their known gamertags. Set `member` when a row's gamertag matches one of these, allowing for small OCR-style differences (e.g. I vs 1, O vs 0); otherwise null:",
    members,
    "",
    "Rules:",
    "- Read every number from the image. Use null for a value you cannot read.",
    spec.teams
      ? "- Set `team` to the team label shown above the row and `winning_team` to the team marked WINNER."
      : "- Set `team` and `winning_team` to null.",
  ].join("\n");
}

/** Fingerprint of everything a model sees besides the image, for the write-up. */
export function promptFingerprint(spec: GameSpec): string {
  const schema = JSON.stringify(z.toJSONSchema(buildSchema(spec)));
  return createHash("sha256")
    .update(SYSTEM_PROMPT)
    .update(buildPrompt(spec))
    .update(schema)
    .digest("hex")
    .slice(0, 12);
}
