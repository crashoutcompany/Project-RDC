"use server";

import type { Prisma } from "@/generated/prisma/client";
import prisma, { handlePrismaOperation } from "prisma/db";
import { requireAdmin } from "@/lib/auth/require-admin";
import { errorCodes } from "@/lib/constants";
import { revalidateSessionData } from "@/lib/revalidate";
import { PLAYER_NAME_FIELD } from "@/lib/visionTypes";
import { stillHoldsRead } from "@/lib/vision/import-flags";
import {
  loadFlagTree,
  matchAt,
  statsAt,
  type FlagTreeMatch,
} from "prisma/lib/vision-flags";

export type FlagResolution =
  | { action: "confirm" }
  | { action: "reject" }
  /** A stat's right value, or for a name flag the right player's id. */
  | { action: "correct"; value: string };

/** A message an admin should see; anything else becomes a generic error. */
class FlagError extends Error {}

/**
 * Admin-only: every open flag on a session that isn't approved yet, oldest
 * session first, with the session's players for correcting a name.
 */
export async function listFlaggedImports() {
  const admin = await requireAdmin();
  if (!admin) return { error: errorCodes.NotAuthenticated, data: null };

  const res = await handlePrismaOperation(async (prisma) => {
    const flags = await prisma.visionImportFlag.findMany({
      where: { status: "PENDING", session: { isApproved: false } },
      orderBy: [
        { sessionId: "asc" },
        { setIndex: "asc" },
        { matchIndex: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        sessionId: true,
        setIndex: true,
        matchIndex: true,
        field: true,
        readValue: true,
        confidence: true,
        player: { select: { playerId: true, playerName: true } },
        session: {
          select: { sessionName: true, Game: { select: { gameName: true } } },
        },
      },
    });
    const sessionIds = [...new Set(flags.map((flag) => flag.sessionId))];
    const players = sessionIds.length
      ? await prisma.playerSession.findMany({
          where: { sessionId: { in: sessionIds } },
          distinct: ["sessionId", "playerId"],
          select: {
            sessionId: true,
            player: { select: { playerId: true, playerName: true } },
          },
        })
      : [];
    return { flags, players };
  });

  if (!res.success)
    return { error: res.error || "Failed to load flagged imports", data: null };
  return { error: null, data: res.data };
}

/** Writes a stat's corrected value. Returns the value as stored. */
async function correctStat(
  tx: Prisma.TransactionClient,
  playerSessionId: number,
  statName: string,
  value: string,
) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) throw new FlagError("Enter a whole number.");
  const statValue = String(parseInt(trimmed, 10));

  const updated = await tx.playerStat.updateMany({
    where: { playerSessionId, gameStat: { statName } },
    data: { value: statValue },
  });
  if (updated.count === 0)
    throw new FlagError("That stat is no longer in this match.");
  return statValue;
}

/**
 * Moves the flagged row to the right player: their player session, stats and
 * match win, plus the match's other open flags. Returns the player's name.
 */
async function correctPlayer(
  tx: Prisma.TransactionClient,
  flag: {
    id: number;
    sessionId: number;
    setIndex: number;
    matchIndex: number;
    playerId: number;
  },
  match: FlagTreeMatch,
  playerSessionId: number,
  value: string,
) {
  const playerId = Number(value);
  if (!Number.isInteger(playerId) || playerId <= 0)
    throw new FlagError("Pick a player.");
  if (playerId === flag.playerId)
    throw new FlagError("That's the same player. Confirm the flag instead.");
  if (match.playerSessions.some((ps) => ps.playerId === playerId))
    throw new FlagError("That player is already in this match.");

  // Only someone already playing in this session; a stale page or a crafted
  // call can't add an outsider to one match.
  const inSession = await tx.playerSession.findFirst({
    where: { sessionId: flag.sessionId, playerId },
    select: { player: { select: { playerName: true } } },
  });
  if (!inSession) throw new FlagError("That player isn't in this session.");
  const { player } = inSession;

  await tx.playerSession.update({
    where: { playerSessionId },
    data: { playerId },
  });
  await tx.playerStat.updateMany({
    where: { playerSessionId },
    data: { playerId },
  });
  if (match.matchWinners.some((w) => w.playerId === flag.playerId))
    await tx.match.update({
      where: { matchId: match.matchId },
      data: {
        matchWinners: {
          disconnect: { playerId: flag.playerId },
          connect: { playerId },
        },
      },
    });
  await tx.visionImportFlag.updateMany({
    where: {
      sessionId: flag.sessionId,
      setIndex: flag.setIndex,
      matchIndex: flag.matchIndex,
      playerId: flag.playerId,
      id: { not: flag.id },
    },
    data: { playerId },
  });
  return player.playerName;
}

/**
 * Admin-only: confirms, corrects or rejects one flagged field. Only a
 * session that isn't approved yet can be changed here; an approved one goes
 * through an edit request. Resolving never approves the session, and an open
 * flag never stops approval.
 */
export async function resolveVisionFlag(
  flagId: number,
  resolution: FlagResolution,
): Promise<{ error: string | null }> {
  const admin = await requireAdmin();
  if (!admin) return { error: errorCodes.NotAuthenticated };

  try {
    await prisma.$transaction(async (tx) => {
      const flag = await tx.visionImportFlag.findUnique({
        where: { id: flagId },
        select: {
          id: true,
          sessionId: true,
          setIndex: true,
          matchIndex: true,
          playerId: true,
          field: true,
          readValue: true,
          status: true,
          session: { select: { isApproved: true } },
        },
      });
      if (!flag) throw new FlagError("Flag not found.");
      if (flag.status !== "PENDING")
        throw new FlagError("This flag was already reviewed.");
      if (flag.session.isApproved)
        throw new FlagError(
          "This session is already approved. Use an edit request to change it.",
        );

      let correctedValue: string | undefined;
      if (resolution.action === "correct") {
        const tree = await loadFlagTree(tx, flag.sessionId);
        const match = matchAt(tree, flag);
        const playerSession = match?.playerSessions.find(
          (ps) => ps.playerId === flag.playerId,
        );
        if (!match || !playerSession)
          throw new FlagError("That player is no longer in this match.");
        // The flag finds its match by position. If an edit changed this field
        // or moved matches around, writing here could hit the wrong match.
        if (!stillHoldsRead(flag, statsAt(tree, flag)))
          throw new FlagError(
            "This field changed since import. Review it from Edit.",
          );

        correctedValue =
          flag.field === PLAYER_NAME_FIELD
            ? await correctPlayer(
                tx,
                flag,
                match,
                playerSession.playerSessionId,
                resolution.value,
              )
            : await correctStat(
                tx,
                playerSession.playerSessionId,
                flag.field,
                resolution.value,
              );
      }

      // The status condition makes a concurrent review lose instead of
      // applying twice.
      const claimed = await tx.visionImportFlag.updateMany({
        where: { id: flagId, status: "PENDING" },
        data: {
          status:
            resolution.action === "confirm"
              ? "CONFIRMED"
              : resolution.action === "reject"
                ? "REJECTED"
                : "CORRECTED",
          correctedValue,
          reviewedBy: admin.user?.email,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count === 0)
        throw new FlagError("This flag was already reviewed.");
    });
  } catch (error) {
    if (error instanceof FlagError) return { error: error.message };
    console.error("resolveVisionFlag error", error);
    return { error: "Failed to review the flag. Please try again." };
  }

  if (resolution.action === "correct") revalidateSessionData();
  return { error: null };
}
