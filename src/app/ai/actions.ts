"use server";

import { auth } from "@/lib/auth";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import type { ProcessedSet } from "../(routes)/(groups)/games/[slug]/_components/match-data";
import {
  AI_TELEMETRY_INCLUDE_RUNTIME_CONTEXT,
  AiTelemetryProperty,
  flushAiTelemetry,
} from "@/posthog/ai-telemetry";
// import { createStreamableValue } from "@ai-sdk/rsc";

import { mvpSystemPrompt } from "./prompts";
import prisma, { handlePrismaOperation } from "prisma/db";
import {
  logMvpUpdateFailure,
  logMvpUpdateSuccess,
} from "@/posthog/server-analytics";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { MvpOutput, mvpSchema } from "./types";
import { errorCodes } from "@/lib/constants";
import { headers } from "next/headers";

type AdminUser = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>["user"] & { role?: string };

export const analyzeMvp = async (
  sets: ProcessedSet[],
  sessionId: number,
): Promise<MvpOutput> => {
  try {
    const authSession = await auth.api.getSession({ headers: await headers() });
    const user = authSession?.user as AdminUser | undefined;
    if (!authSession || user?.role !== "admin")
      throw new Error(errorCodes.NotAuthenticated);

    if (!sessionId || sessionId <= 0) throw new Error("Invalid session ID");

    // Fast path: If MVP is already calculated, return it immediately.
    const existingSession = await prisma.session.findFirst({
      where: { sessionId, mvpId: { not: null } },
      include: { mvp: true }, // Include the player relation
    });

    if (existingSession && existingSession.mvp) {
      return {
        description: existingSession.mvpDescription ?? "",
        stats: existingSession.mvpStats as MvpOutput["stats"],
        player: existingSession.mvp.playerName,
      };
    }

    const now = performance.now();

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
          distinctId: authSession.user?.email ?? "Unidentified User",
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
      after(() => flushAiTelemetry());
    }

    const player = await prisma.player.findFirst({
      where: { playerName: { startsWith: output.player } },
    });

    // Atomically update the session ONLY if an MVP has not been set.
    const updateResult = await handlePrismaOperation((prisma) =>
      prisma.session.updateMany({
        where: {
          sessionId,
          mvpId: null,
        },
        data: {
          mvpDescription: output.description,
          mvpStats: output.stats,
          mvpId: player?.playerId,
        },
      }),
    );

    const duration = (performance.now() - now) / 1000;

    // If we successfully updated the record (count > 0), we won the race.
    if (updateResult.success && updateResult.data.count > 0) {
      revalidateTag("getAllSessions", "max");
      after(() =>
        logMvpUpdateSuccess(
          sessionId,
          output,
          new Date(),
          duration,
          authSession,
        ),
      );
      return output;
    }

    // If count is 0, we lost the race. Another process set the MVP.
    // Fetch the data that the other process just wrote.
    const newlyUpdatedSession = await prisma.session.findFirstOrThrow({
      where: { sessionId },
      include: { mvp: true },
    });

    // TODO Maybe remove
    // This should be an impossible state, but handle it defensively.
    if (!newlyUpdatedSession.mvp)
      throw new Error("MVP data not found after race condition loss.");

    return {
      description: newlyUpdatedSession.mvpDescription ?? "",
      stats: newlyUpdatedSession.mvpStats as MvpOutput["stats"],
      player: newlyUpdatedSession.mvp.playerName,
    };
  } catch (error) {
    console.log(error);
    after(async () => await logMvpUpdateFailure(sessionId, error));
    throw error;
  }
};
