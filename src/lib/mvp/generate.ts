import "server-only";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import prisma, { handlePrismaOperation } from "prisma/db";
import { getSessionById } from "prisma/lib/session";
import { mvpSystemPrompt } from "@/app/ai/prompts";
import { MvpOutput, mvpSchema } from "@/app/ai/types";
import {
  AI_TELEMETRY_INCLUDE_RUNTIME_CONTEXT,
  AiTelemetryProperty,
  flushAiTelemetry,
} from "@/posthog/ai-telemetry";
import { logMvpUpdateSuccess } from "@/posthog/server-analytics";
import { revalidateSessionData } from "@/lib/revalidate";
import { getSetsData, ProcessedSet } from "./process-sets";

type UserSession = Parameters<typeof logMvpUpdateSuccess>[4];

export type GenerateMvpOptions = {
  /** Signed-in admin driving the request, for telemetry. Omit for background runs. */
  userSession?: UserSession;
  /** Sets built by the caller. When omitted they are loaded and processed from the database. */
  sets?: ProcessedSet[];
};

const storedMvp = (sessionId: number) =>
  prisma.session.findFirst({
    where: { sessionId, mvpId: { not: null } },
    include: { mvp: true },
  });

/**
 * Generates and stores the MVP for an approved session, returning the stored
 * one if it already exists. Returns null when the session has no supported
 * sets to analyse. Throws on failure; callers decide how to log it.
 */
export async function generateMvpForSession(
  sessionId: number,
  opts: GenerateMvpOptions = {},
): Promise<MvpOutput | null> {
  const existing = await storedMvp(sessionId);
  if (existing?.mvp)
    return {
      description: existing.mvpDescription ?? "",
      stats: existing.mvpStats as MvpOutput["stats"],
      player: existing.mvp.playerName,
    };

  let sets = opts.sets;
  if (!sets) {
    const loaded = await getSessionById(sessionId);
    if (!loaded.success)
      throw new Error(loaded.error ?? "Failed to load session");
    if (!loaded.data) throw new Error(`Session ${sessionId} not found`);
    sets = getSetsData(loaded.data);
    if (sets.length === 0) return null;
  }

  const startedAt = performance.now();
  let output: MvpOutput;
  try {
    const result = await generateText({
      model: google("gemini-2.5-flash"),
      output: Output.object({ schema: mvpSchema }),
      system: mvpSystemPrompt,
      prompt: `Analyze the following game sets and determine the MVP based on the provided statistics: ${JSON.stringify(
        sets,
      )}`,
      runtimeContext: {
        distinctId: opts.userSession?.user?.email ?? "Unidentified User",
        traceName: "analyze-mvp",
        properties: {
          [AiTelemetryProperty.ENVIRONMENT]: process.env.NODE_ENV,
          [AiTelemetryProperty.SESSION_ID]: sessionId,
        },
      },
      telemetry: {
        functionId: "analyze-mvp",
        includeRuntimeContext: AI_TELEMETRY_INCLUDE_RUNTIME_CONTEXT,
      },
    });

    if (!result.output) throw new Error("MVP analysis produced no result");

    output = result.output;
    console.log("Total usage:", result.usage);
  } finally {
    await flushAiTelemetry();
  }

  const player = await prisma.player.findFirst({
    where: { playerName: { startsWith: output.player } },
  });

  // Only write while the session still has no MVP, so concurrent runs can't overwrite each other.
  const updateResult = await handlePrismaOperation((prisma) =>
    prisma.session.updateMany({
      where: { sessionId, mvpId: null },
      data: {
        mvpDescription: output.description,
        mvpStats: output.stats,
        mvpId: player?.playerId,
      },
    }),
  );

  if (updateResult.success && updateResult.data.count > 0) {
    revalidateSessionData();
    await logMvpUpdateSuccess(
      sessionId,
      output,
      new Date(),
      (performance.now() - startedAt) / 1000,
      opts.userSession,
    );
    return output;
  }

  // Lost the race: another run stored an MVP first, so return that one.
  const newlyUpdatedSession = await prisma.session.findFirstOrThrow({
    where: { sessionId },
    include: { mvp: true },
  });

  // This should be an impossible state, but handle it defensively.
  if (!newlyUpdatedSession.mvp)
    throw new Error("MVP data not found after race condition loss.");

  return {
    description: newlyUpdatedSession.mvpDescription ?? "",
    stats: newlyUpdatedSession.mvpStats as MvpOutput["stats"],
    player: newlyUpdatedSession.mvp.playerName,
  };
}
