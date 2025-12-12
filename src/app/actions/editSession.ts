"use server";

import prisma, { handlePrismaOperation } from "prisma/db";
import { auth } from "@/lib/auth";
import { errorCodes } from "@/lib/constants";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { UseFormReturn } from "react-hook-form";
import { FormValues } from "../(routes)/admin/_utils/form-helpers";
import { Prisma } from "@/generated/prisma/client";
import { headers } from "next/headers";

type CreateEditResult = { error: string | null };

export type ProposedData = {
  proposedData: FormValues;
  dirtyFields: UseFormReturn<FormValues>["formState"]["dirtyFields"];
};

type AdminUser = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>["user"] & { role?: string };

/**
 * Create a session edit request. Stores proposed changes in JSON and marks as PENDING.
 */
export async function createSessionEditRequest(
  sessionId: number,
  proposedData: FormValues,
  dirtyFields: UseFormReturn<FormValues>["formState"]["dirtyFields"],
): Promise<CreateEditResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: errorCodes.NotAuthenticated };
  else if (Object.keys(dirtyFields).length === 0) {
    return { error: "No changes detected to submit." };
  }

  try {
    const json = JSON.stringify(
      { proposedData: proposedData, dirtyFields: dirtyFields },
      null,
      2,
    );
    const res = await handlePrismaOperation((prisma) =>
      prisma.sessionEditRequest.create({
        data: {
          sessionId,
          proposerId: session.user.id,
          proposedData: json,
        },
      }),
    );

    if (!res.success)
      return { error: res.error || "Failed to create edit request" };

    // Optionally notify admins here
    return { error: null };
  } catch (err) {
    console.error("createSessionEditRequest error", err);
    return { error: "Unknown error creating edit request" };
  }
}

export async function listPendingEdits() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user as AdminUser | undefined;
  if (!session || user?.role !== "admin")
    return { error: errorCodes.NotAuthenticated };

  // Only allow admins - this project doesn't have roles implemented here, so assume authenticated is fine
  const res = await handlePrismaOperation((prisma) =>
    prisma.sessionEditRequest.findMany({
      where: { status: "PENDING" },
      include: { session: true, proposer: true },
      orderBy: { createdAt: "desc" },
    }),
  );

  if (!res.success)
    return { error: res.error || "Failed to load pending edits", data: [] };
  return { error: null, data: res.data };
}

// Todo rework function
/** Approve an edit: create a SessionRevision snapshot, apply changes to Session, mark request APPROVED */
export async function approveEditRequest(editId: number, note?: string) {
  type SessionSelect = {
    sessionId: number;
    date: Date;
    sets: {
      sessionId: number;
      setId: number;
      createdAt: Date;
      updatedAt: Date;
    }[];
    gameId: number;
  };
  const user = await auth.api.getSession({ headers: await headers() });
  const adminUser = user?.user as AdminUser | undefined;
  if (!user || adminUser?.role !== "admin")
    return { error: errorCodes.NotAuthenticated };

  // Helper: create a revision snapshot
  async function createRevision(
    tx: Prisma.TransactionClient,
    session: SessionSelect,
    createdBy?: string | null,
  ) {
    const json = JSON.stringify(session, null, 2);
    await tx.sessionRevision.create({
      data: {
        sessionId: session.sessionId,
        snapshot: json,
        createdBy,
      },
    });
  }

  // Helper: mark edit request as approved
  async function markRequestApproved(
    tx: Prisma.TransactionClient,
    id: number,
    reviewer: any,
    reviewNote?: string,
  ) {
    await tx.sessionEditRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewerId: reviewer.user?.id,
        reviewNote,
        reviewedAt: new Date(),
        appliedAt: new Date(),
        appliedBy: reviewer.user?.email,
      },
    });
  }

  // Helper: apply top-level session field updates
  async function applyTopLevelUpdates(
    tx: Prisma.TransactionClient,
    sessionId: number,
    dirtyFields: ProposedData["dirtyFields"],
    proposedData: ProposedData["proposedData"],
  ) {
    await tx.session.update({
      where: { sessionId },
      data: {
        ...(dirtyFields.sessionUrl && { sessionUrl: proposedData.sessionUrl }),
        ...(dirtyFields.sessionName && {
          sessionName: proposedData.sessionName,
        }),
        ...(dirtyFields.thumbnail && { thumbnail: proposedData.thumbnail }),
        ...(dirtyFields.videoId && { videoId: proposedData.videoId }),
      },
    });
  }

  // Helper: create match + nested playerSessions and playerStats
  async function createMatchAndNested(
    tx: Prisma.TransactionClient,
    session: SessionSelect,
    setId: number,
    match: ProposedData["proposedData"]["sets"][number]["matches"][number],
  ) {
    const newMatch = await tx.match.create({
      data: {
        setId,
        matchWinners: {
          connect:
            match.matchWinners?.map((w) => ({ playerId: w.playerId })) || [],
        },
      },
    });

    for (
      let psIndex = 0;
      psIndex < (match.playerSessions || []).length;
      psIndex++
    ) {
      const ps = match.playerSessions[psIndex];
      const newPs = await tx.playerSession.create({
        data: {
          playerId: ps.playerId,
          sessionId: session.sessionId,
          matchId: newMatch.matchId,
          setId,
        },
      });

      if (ps.playerStats && ps.playerStats.length > 0) {
        const statsToCreate = ps.playerStats.map((stat) => ({
          playerId: newPs.playerId,
          gameId: session.gameId,
          playerSessionId: newPs.playerSessionId,
          statId: Number(stat.statId),
          value: stat.statValue,
          date: session.date,
        }));
        await tx.playerStat.createMany({ data: statsToCreate });
      }
    }
  }

  // Helper: create a set and its nested matches/playerSessions/playerStats and connect winners
  async function createSetWithMatches(
    tx: Prisma.TransactionClient,
    session: SessionSelect,
    set: ProposedData["proposedData"]["sets"][number],
  ) {
    const newSet = await tx.gameSet.create({
      data: { sessionId: session.sessionId },
    });

    if (set.setWinners && set.setWinners.length > 0) {
      await tx.gameSet.update({
        where: { setId: newSet.setId },
        data: {
          setWinners: {
            connect: set.setWinners.map((w) => ({ playerId: w.playerId })),
          },
        },
      });
    }

    for (let m = 0; m < (set.matches || []).length; m++) {
      await createMatchAndNested(tx, session, newSet.setId, set.matches[m]);
    }
  }

  // Helper: replace all sets for a session
  async function replaceAllSets(
    tx: Prisma.TransactionClient,
    session: SessionSelect,
    proposedSets: ProposedData["proposedData"]["sets"],
  ) {
    await tx.gameSet.deleteMany({ where: { sessionId: session.sessionId } });

    for (let i = 0; i < proposedSets.length; i++) {
      await createSetWithMatches(tx, session, proposedSets[i]);
    }
  }

  // Helper: update existing sets (same count) by replacing winners and matches
  async function updateExistingSets(
    tx: Prisma.TransactionClient,
    session: SessionSelect,
    proposedSets: ProposedData["proposedData"]["sets"],
  ) {
    for (const set of proposedSets) {
      const existingSet = session.sets.find((s) => set.setId === s.setId);
      if (!existingSet) {
        console.warn(
          `No existing set found for proposed set with ID ${set.setId}`,
        );
        continue;
      }

      // replace set winners (keeps previous approach, even if it uses a project-specific pattern)
      await tx.gameSet.update({
        where: { setId: existingSet.setId },
        data: {
          setWinners: {
            set: set.setWinners?.map((w) => ({ playerId: w.playerId })) || [],
          },
        },
      });

      // remove existing matches for this set and recreate
      await tx.match.deleteMany({ where: { setId: existingSet.setId } });

      for (let m = 0; m < (set.matches || []).length; m++) {
        await createMatchAndNested(
          tx,
          session,
          existingSet.setId,
          set.matches[m],
        );
      }
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const edit = await tx.sessionEditRequest.findUnique({
        where: { id: editId },
      });
      if (!edit) throw new Error("Edit request not found");
      if (edit.status !== "PENDING")
        throw new Error("Edit request is not pending");

      const session = await tx.session.findUnique({
        where: { sessionId: edit.sessionId },
        select: { sessionId: true, sets: true, gameId: true, date: true },
      });
      if (!session) throw new Error("Session not found");

      const newJson = JSON.parse(edit.proposedData as string) as ProposedData;

      // create revision and mark approved
      await createRevision(tx, session, user.user?.email ?? null);
      await markRequestApproved(tx, editId, user, note);

      // top-level updates
      await applyTopLevelUpdates(
        tx,
        session.sessionId,
        newJson.dirtyFields,
        newJson.proposedData,
      );

      const proposedSets = newJson.proposedData.sets || [];

      if (session.sets.length !== proposedSets.length) {
        await replaceAllSets(tx, session, proposedSets);
      } else {
        await updateExistingSets(tx, session, proposedSets);
      }
    });

    revalidateTag("getAllSessions", "max");
    after(() => console.log(`Edit ${editId} approved by ${user.user?.id}`));
    return { error: null };
  } catch (err) {
    console.error("approveEditRequest error", err);
    return { error: String(err) };
  }
}

export async function rejectEditRequest(editId: number, note?: string) {
  const user = await auth.api.getSession({ headers: await headers() });
  const adminUser = user?.user as AdminUser | undefined;
  if (!user || adminUser?.role !== "admin")
    return { error: errorCodes.NotAuthenticated };

  try {
    const res = await handlePrismaOperation((prisma) =>
      prisma.sessionEditRequest.update({
        where: { id: editId },
        data: {
          status: "REJECTED",
          reviewerId: user.user?.id,
          reviewNote: note,
          reviewedAt: new Date(),
        },
      }),
    );

    if (!res.success)
      return { error: res.error || "Failed to reject edit request" };
    return { error: null };
  } catch (err) {
    console.error("rejectEditRequest error", err);
    return { error: String(err) };
  }
}
