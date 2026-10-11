import { createGoogleGenerativeAI, type GoogleLanguageModelOptions } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { findPlayer } from "@/app/(routes)/admin/_utils/player-mappings";
import type { AnalyzedPlayer, AnalyzedPlayersObj } from "@/lib/visionTypes";
import type { ScoreboardFields } from "./analyze-scoreboard";
import { UnusableOutputError } from "./api-errors";
import { buildPrompt, buildSchema, SYSTEM_PROMPT, type ScoreboardOutput } from "./gemini-prompt";
import { screenStatConfigs, specForGameId, type GameSpec } from "./scoreboard-specs";

export const GEMINI_MODEL = "gemini-3.8-flash";
/** The setting the benchmark validated: "low" thinking for Gemini 3.x. */
export const GEMINI_THINKING = { thinkingLevel: "low" } as const;
/** Reads take ~5s; a hung request times out (retryable) so the fallback still gets a turn. */
const GEMINI_TIMEOUT_MS = 60_000;

/** Media type from the file's magic bytes; screenshots arrive as bare base64. */
export function sniffMediaType(base64: string): string {
  const head = Buffer.from(base64.slice(0, 16), "base64");
  if (head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
  if (head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "image/png";
}

export function requireSpec(gameId: number): GameSpec {
  const spec = specForGameId(gameId);
  if (!spec) throw new UnusableOutputError(`Gemini has no scoreboard spec for game ${gameId}`);
  return spec;
}

/**
 * Reads one screenshot with Gemini (structured output, AI SDK). Throws on API
 * errors and on output that doesn't match the schema; retries are the
 * caller's job (see api-errors.ts), so the SDK's own are off.
 */
export async function extractWithGemini(args: {
  base64Source: string;
  gameId: number;
  model?: string;
  apiKey?: string;
}): Promise<ScoreboardFields> {
  const spec = requireSpec(args.gameId);
  const google = createGoogleGenerativeAI({
    apiKey: args.apiKey,
    baseURL: process.env.GOOGLE_GENERATIVE_AI_BASE_URL,
  });
  const result = await generateText({
    model: google(args.model ?? GEMINI_MODEL),
    abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "file", mediaType: sniffMediaType(args.base64Source), data: args.base64Source },
          { type: "text", text: buildPrompt(spec) },
        ],
      },
    ],
    output: Output.object({ schema: buildSchema(spec) }),
    providerOptions: {
      google: { thinkingConfig: GEMINI_THINKING } satisfies GoogleLanguageModelOptions,
    },
    maxRetries: 0,
  });
  return geminiOutputToFields(spec, result.output);
}

/** Parses Gemini's JSON text (batch results arrive as text) into fields. */
export function parseGeminiText(spec: GameSpec, text: string): ScoreboardFields {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new UnusableOutputError("Gemini returned text that isn't JSON");
  }
  const parsed = buildSchema(spec).safeParse(json);
  if (!parsed.success)
    throw new UnusableOutputError(`Gemini output doesn't match the schema: ${z.prettifyError(parsed.error)}`);
  return geminiOutputToFields(spec, parsed.data);
}

/**
 * Gemini's answer in Azure's field layout, so the existing game processors map
 * players, validate stats, and pick winners exactly as they do for Azure.
 * A row Gemini matched to a member is passed under the member's name, so the
 * processor's exact-match lookup doesn't undo Gemini's fuzzy gamertag match.
 */
export function geminiOutputToFields(spec: GameSpec, output: ScoreboardOutput): ScoreboardFields {
  const configs = screenStatConfigs(spec);
  const toPlayer = (row: ScoreboardOutput["players"][number]): AnalyzedPlayer => {
    const name = (row.member && findPlayer(row.member)?.playerName) || row.gamertag;
    const stats = row.stats as Record<string, number | null>;
    return {
      type: "object",
      valueObject: {
        PlayerName: { type: "string", content: name, confidence: 1 },
        ...Object.fromEntries(
          configs.map((config) => {
            const value = stats[config.fieldKey];
            // undefined content makes the processor default to 0 and flag the match for review.
            return [
              config.fieldKey,
              { type: "string", content: value === null || value === undefined ? undefined : String(value), confidence: 1 },
            ];
          }),
        ),
      } as AnalyzedPlayer["valueObject"],
    };
  };
  const array = (rows: ScoreboardOutput["players"]): AnalyzedPlayersObj => ({
    type: "array",
    valueArray: rows.map(toPlayer),
  });

  if (!spec.teams) return [array(output.players)];
  const teams = new Map<string, ScoreboardOutput["players"]>();
  for (const row of output.players) {
    const label = row.team?.trim().toUpperCase() ?? "";
    const teamName = spec.teamFields?.[label] ?? label;
    teams.set(teamName, [...(teams.get(teamName) ?? []), row]);
  }
  return [...teams].map(([teamName, rows]) => ({ teamName, players: array(rows) }));
}
