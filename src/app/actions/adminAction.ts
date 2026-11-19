"use server";

import type { GameStat } from "@/generated/prisma/client";
import prisma, { handlePrismaOperation } from "prisma/db";
import { SESSION_TX_OPTIONS, writeSessionTree } from "prisma/lib/session-tree";
import { FormValues, formSchema } from "../(routes)/admin/_utils/form-helpers";
import { requireAdmin } from "@/lib/auth/require-admin";
import { errorCodes } from "@/lib/constants";
import { revalidateTag } from "next/cache";
import {
  logAdminAction,
  logFormError,
  logFormSuccess,
  logMvpUpdateFailure,
} from "@/posthog/server-analytics";
import { after } from "next/server";
import { revalidateSessionData } from "@/lib/revalidate";
import { PostHogEvents } from "@/posthog/events";
import { generateMvpForSession } from "@/lib/mvp/generate";
import { MVP_GAMES } from "@/lib/mvp/process-sets";

export async function approveSession(sessionId: number) {
  try {
    const authUser = await requireAdmin();
    if (!authUser) return { error: errorCodes.NotAuthenticated };

    const query = await handlePrismaOperation((prisma) =>
      prisma.session.update({
        where: { sessionId, isApproved: false },
        data: { isApproved: true },
        select: { sessionId: true },
      }),
    );

    if (!query.success) {
      return { error: query.error || "Failed to approve session" };
    }

    after(() =>
      logAdminAction(PostHogEvents.SESSION_APPROVED, { sessionId }, authUser),
    );
    if (process.env.AUTO_MVP !== "0")
      after(async () => {
        try {
          await generateMvpForSession(sessionId, { userSession: authUser });
        } catch (error) {
          await logMvpUpdateFailure(sessionId, error, authUser);
        }
      });
    revalidateSessionData();
    return { error: null };
  } catch (error) {
    console.error("Error approving session:", error);
    return { error: "Failed to approve session" };
  }
}

/**
 * Admin-only: generates MVPs for approved sessions missing one, newest first.
 * Runs sequentially to respect the Gemini free-tier quota; `remaining` counts
 * sessions still without an MVP after this run.
 */
export async function backfillMissingMvps({
  limit = 5,
}: { limit?: number } = {}) {
  const authUser = await requireAdmin();
  if (!authUser) return { error: errorCodes.NotAuthenticated };

  const missing = {
    isApproved: true,
    mvpId: null,
    Game: { gameName: { in: [...MVP_GAMES] } },
  };
  const query = await handlePrismaOperation((prisma) =>
    prisma.session.findMany({
      where: missing,
      orderBy: { date: "desc" },
      take: Math.max(1, Math.floor(limit)),
      select: { sessionId: true },
    }),
  );
  if (!query.success)
    return { error: query.error || "Failed to load sessions" };

  let processed = 0;
  const failed: { sessionId: number; error: string }[] = [];
  // Sequential on purpose: each session makes an AI call, so this stays well
  // under the provider's rate limits.
  for (const { sessionId } of query.data) {
    try {
      const mvp = await generateMvpForSession(sessionId, {
        userSession: authUser,
      });
      if (mvp) processed++;
      else failed.push({ sessionId, error: "No sets to analyze" });
    } catch (error) {
      failed.push({
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      await logMvpUpdateFailure(sessionId, error, authUser);
    }
  }

  const remaining = await handlePrismaOperation((prisma) =>
    prisma.session.count({ where: missing }),
  );
  return {
    processed,
    failed,
    remaining: remaining.success ? remaining.data : null,
  };
}

export async function getGameStats(
  gameName: string,
): Promise<GameStat[] | { error: string }> {
  const authUser = await requireAdmin();
  if (!authUser) return { error: errorCodes.NotAuthenticated };

  const game = await handlePrismaOperation((prisma) =>
    prisma.game.findFirst({ where: { gameName } }),
  );

  if (!game.success || !game.data) return [];

  const gameId = game.data.gameId;
  const gameStats = await handlePrismaOperation((prisma) =>
    prisma.gameStat.findMany({
      where: {
        gameId: gameId,
      },
    }),
  );

  if (!gameStats.success || !gameStats.data) {
    throw new Error("Stats not found.");
  }
  return gameStats.data;
}

export const insertNewSessionFromAdmin = async (
  session: FormValues,
): Promise<{ error: null | string }> => {
  const user = await requireAdmin();
  if (!user) return { error: errorCodes.NotAuthenticated };

  try {
    const parsed = formSchema.safeParse(session);
    if (!parsed.success)
      return { error: "Invalid session data. Please review the form." };

    const validatedSession = parsed.data;

    const sessionGame = await prisma.game.findFirst({
      where: { gameName: validatedSession.game },
    });
    if (!sessionGame) return { error: "Game not found." };

    const videoAlreadyExists = await prisma.session.findFirst({
      where: {
        gameId: sessionGame.gameId,
        AND: { videoId: validatedSession.videoId },
      },
    });
    if (videoAlreadyExists) return { error: "Video already exists." };

    await prisma.$transaction(async (tx) => {
      const { sessionId } = await tx.session.create({
        data: {
          gameId: sessionGame.gameId,
          sessionName: validatedSession.sessionName,
          sessionUrl: validatedSession.sessionUrl,
          thumbnail: validatedSession.thumbnail,
          date: validatedSession.date,
          videoId: validatedSession.videoId,
          createdBy: user.user?.email || "SYSTEM",
          dayWinners: {
            connect: validatedSession.dayWinners.map((p) => ({
              playerId: p.playerId,
            })),
          },
        },
      });

      await writeSessionTree(
        tx,
        {
          sessionId,
          gameId: sessionGame.gameId,
          date: new Date(validatedSession.date),
        },
        validatedSession.sets,
      );
    }, SESSION_TX_OPTIONS);

    after(() => logFormSuccess("ADMIN_FORM", user));
    revalidateSessionData();
    return { error: null };
  } catch (err) {
    after(() => logFormError(err, session));
    return { error: "Unknown error occurred. Please try again." };
  }
};

export async function addGame(
  formData: FormData,
): Promise<{ error: string | null }> {
  const session = await requireAdmin();
  if (!session) return { error: errorCodes.NotAuthenticated };

  const gameName = formData.get("gameName") as string;
  if (!gameName) return { error: "Game name is required." };

  const res = await handlePrismaOperation((prisma) =>
    prisma.game.create({ data: { gameName } }),
  );

  if (!res.success) return { error: res.error || "Failed to add game." };

  after(() => logAdminAction(PostHogEvents.GAME_ADDED, { gameName }, session));

  revalidateTag("getAllGames", "max");
  return { error: null };
}

export async function addPlayer(
  formData: FormData,
): Promise<{ error: string | null }> {
  const session = await requireAdmin();
  if (!session) return { error: errorCodes.NotAuthenticated };

  const playerName = formData.get("playerName") as string;
  if (!playerName) return { error: "Player name is required." };

  const res = await handlePrismaOperation((prisma) =>
    prisma.player.create({ data: { playerName } }),
  );

  if (!res.success) return { error: res.error || "Failed to add player." };

  after(() =>
    logAdminAction(PostHogEvents.PLAYER_ADDED, { playerName }, session),
  );

  revalidateTag("getAllMembers", "max");
  return { error: null };
}

export async function addGameStat(
  formData: FormData,
): Promise<{ error: string | null }> {
  const session = await requireAdmin();
  if (!session) return { error: errorCodes.NotAuthenticated };

  const statName = formData.get("statName") as string;
  const gameId = Number(formData.get("gameId"));
  const type = formData.get("type") as string;

  if (!statName || !gameId || !type)
    return { error: "Missing required fields." };

  const res = await handlePrismaOperation((prisma) =>
    prisma.gameStat.create({
      data: {
        statName,
        gameId,
        type: type === "INT" ? "INT" : "STRING",
      },
    }),
  );
  if (!res.success) return { error: res.error || "Failed to add game stat." };

  revalidateTag("getAllGameStats", "max");
  return { error: null };
}
