"use server";

import prisma, { handlePrismaOperation } from "prisma/db";
import { SESSION_TX_OPTIONS, writeSessionTree } from "prisma/lib/session-tree";
import { requireAdmin } from "@/lib/auth/require-admin";
import { errorCodes } from "@/lib/constants";
import { revalidateSessionData } from "@/lib/revalidate";
import { UseFormReturn } from "react-hook-form";
import { FormValues, formSchema } from "../(routes)/admin/_utils/form-helpers";
import { Prisma } from "@/generated/prisma/client";
import { hasChanges, parseProposedData } from "@/lib/proposed-data";

type CreateEditResult = { error: string | null };

export type ProposedData = {
  proposedData: FormValues;
  dirtyFields: UseFormReturn<FormValues>["formState"]["dirtyFields"];
};

/**
 * Create a session edit request. Stores proposed changes in JSON and marks as PENDING.
 */
export async function createSessionEditRequest(
  sessionId: number,
  proposedData: FormValues,
  dirtyFields: UseFormReturn<FormValues>["formState"]["dirtyFields"],
): Promise<CreateEditResult> {
  const session = await requireAdmin();
  if (!session) return { error: errorCodes.NotAuthenticated };
  else if (!hasChanges(dirtyFields)) {
    return { error: "No changes detected to submit." };
  }

  const parsed = formSchema.safeParse(proposedData);
  if (!parsed.success)
    return { error: "Invalid session data. Please review the form." };

  try {
    // Store the object itself (Dates become ISO strings, as before).
    const json = JSON.parse(
      JSON.stringify({ proposedData: parsed.data, dirtyFields: dirtyFields }),
    ) as Prisma.InputJsonObject;
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
  const session = await requireAdmin();
  if (!session) return { error: errorCodes.NotAuthenticated };

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

type AdminSession = NonNullable<Awaited<ReturnType<typeof requireAdmin>>>;

/**
 * Atomically moves the request from PENDING to APPROVED. The status condition
 * makes a concurrent approve/reject lose (count 0) instead of applying the
 * same edit twice.
 */
async function claimRequestForApproval(
  tx: Prisma.TransactionClient,
  id: number,
  reviewer: AdminSession,
  reviewNote?: string,
) {
  const now = new Date();
  const claimed = await tx.sessionEditRequest.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: "APPROVED",
      reviewerId: reviewer.user?.id,
      reviewNote,
      reviewedAt: now,
      appliedAt: now,
      appliedBy: reviewer.user?.email,
    },
  });
  if (claimed.count === 0) throw new Error("Edit request is not pending");
}

async function applyTopLevelUpdates(
  tx: Prisma.TransactionClient,
  sessionId: number,
  { dirtyFields, proposedData }: ProposedData,
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
      ...(dirtyFields.date && { date: new Date(proposedData.date) }),
    },
  });

  // Only replace winners this proposal changed, so a stale proposal can't
  // undo a newer edit. Older proposals may omit the key entirely.
  if (
    hasChanges(dirtyFields.dayWinners) &&
    proposedData.dayWinners !== undefined
  )
    await tx.session.update({
      where: { sessionId },
      data: {
        dayWinners: {
          set: proposedData.dayWinners.map((w) => ({ playerId: w.playerId })),
        },
      },
    });
}

/** Approve an edit: create a SessionRevision snapshot, apply changes to Session, mark request APPROVED */
export async function approveEditRequest(editId: number, note?: string) {
  const user = await requireAdmin();
  if (!user) return { error: errorCodes.NotAuthenticated };

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

      const proposal = parseProposedData(edit.proposedData);

      await claimRequestForApproval(tx, editId, user, note);
      await tx.sessionRevision.create({
        data: {
          sessionId: session.sessionId,
          snapshot: JSON.stringify(session, null, 2),
          createdBy: user.user?.email ?? null,
        },
      });
      await applyTopLevelUpdates(tx, session.sessionId, proposal);

      // Player stats carry the session date, so an edited date reaches them
      // whether or not the sets are rewritten.
      const date = proposal.dirtyFields.date
        ? new Date(proposal.proposedData.date)
        : session.date;

      // Sets are only rewritten when this proposal changed them, so a stale
      // proposal (say, a rename) can't undo a newer edit to the matches.
      if (hasChanges(proposal.dirtyFields.sets))
        await writeSessionTree(
          tx,
          { sessionId: session.sessionId, gameId: session.gameId, date },
          proposal.proposedData.sets || [],
          { replacingSetIds: session.sets.map((set) => set.setId) },
        );
      else if (proposal.dirtyFields.date)
        await tx.playerStat.updateMany({
          where: { playerSession: { sessionId: session.sessionId } },
          data: { date },
        });
    }, SESSION_TX_OPTIONS);

    revalidateSessionData();
    return { error: null };
  } catch (err) {
    console.error("approveEditRequest error", err);
    return { error: String(err) };
  }
}

export async function rejectEditRequest(editId: number, note?: string) {
  const user = await requireAdmin();
  if (!user) return { error: errorCodes.NotAuthenticated };

  try {
    // Only PENDING requests can be rejected; never flip an applied edit.
    const res = await handlePrismaOperation((prisma) =>
      prisma.sessionEditRequest.updateMany({
        where: { id: editId, status: "PENDING" },
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
    if (res.data.count === 0)
      return { error: "Edit request not found or is not pending" };
    return { error: null };
  } catch (err) {
    console.error("rejectEditRequest error", err);
    return { error: String(err) };
  }
}
