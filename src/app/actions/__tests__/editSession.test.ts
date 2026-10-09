import { vi } from "vitest";
import { revalidateTag } from "next/cache";
import prisma from "prisma/db";
import { signInAs, TEST_USERS } from "@/test/session";
import { mk8Set, mk8SessionForm } from "@/test/fixtures";
import type { FormValues } from "@/app/(routes)/admin/_utils/form-helpers";
import {
  approveEditRequest,
  createSessionEditRequest,
  rejectEditRequest,
} from "../editSession";

const db = vi.mocked(prisma, { deep: true });

const MARK = { playerId: 1, playerName: "Mark" } as const;
const DES = { playerId: 2, playerName: "Des" } as const;

beforeEach(() => signInAs("admin"));

describe("createSessionEditRequest", () => {
  it("stores the validated proposal and dirty fields as a pending request", async () => {
    const proposal = mk8SessionForm();

    expect(await createSessionEditRequest(1, proposal, { sessionName: true })).toEqual({
      error: null,
    });

    const { data } = db.sessionEditRequest.create.mock.calls[0][0];
    expect(data).toMatchObject({ sessionId: 1, proposerId: TEST_USERS.admin.id });
    expect(JSON.parse(data.proposedData as string)).toMatchObject({
      proposedData: { sessionName: "MK8 Night" },
      dirtyFields: { sessionName: true },
    });
  });

  it("rejects a request with no changes", async () => {
    expect(await createSessionEditRequest(1, mk8SessionForm(), {})).toEqual({
      error: "No changes detected to submit.",
    });
    expect(db.sessionEditRequest.create).not.toHaveBeenCalled();
  });

  it("rejects a proposal that fails the form schema", async () => {
    // Mario Kart matches must have exactly one winner.
    const invalid = mk8SessionForm();
    invalid.sets[0].matches[0].matchWinners = [MARK, DES] as never;

    expect(await createSessionEditRequest(1, invalid, { sets: true } as never)).toEqual({
      error: "Invalid session data. Please review the form.",
    });
    expect(db.sessionEditRequest.create).not.toHaveBeenCalled();
  });
});

describe("approveEditRequest", () => {
  const existingSet = { setId: 1, sessionId: 1, createdAt: new Date(), updatedAt: new Date() };

  const givenPendingEdit = (
    proposedData: FormValues,
    dirtyFields: Record<string, unknown>,
    status = "PENDING",
  ) => {
    db.session.findUnique.mockResolvedValue({
      sessionId: 1,
      gameId: 1,
      date: new Date("2025-01-01"),
      sets: [existingSet],
    } as never);
    db.sessionEditRequest.findUnique.mockResolvedValue({
      id: 5,
      sessionId: 1,
      status,
      proposedData: JSON.stringify({ proposedData, dirtyFields }),
    } as never);
  };

  it("snapshots the session, records the reviewer, and applies only dirty top-level fields", async () => {
    givenPendingEdit({ ...mk8SessionForm(), sessionName: "Renamed" }, { sessionName: true });

    expect(await approveEditRequest(5, "Looks good")).toEqual({ error: null });

    expect(db.sessionRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessionId: 1, snapshot: expect.any(String) }),
    });
    expect(db.sessionEditRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 5, status: "PENDING" },
      data: expect.objectContaining({
        status: "APPROVED",
        reviewerId: TEST_USERS.admin.id,
        reviewNote: "Looks good",
      }),
    });
    expect(db.session.update).toHaveBeenCalledWith({
      where: { sessionId: 1 },
      data: { sessionName: "Renamed" },
    });
    expect(revalidateTag).toHaveBeenCalledWith("getAllSessions", "max");
  });

  it("rebuilds matches in place when the set count is unchanged", async () => {
    givenPendingEdit(mk8SessionForm([mk8Set(1, DES)]), { sets: true });

    expect(await approveEditRequest(5)).toEqual({ error: null });

    expect(db.gameSet.deleteMany).not.toHaveBeenCalled();
    expect(db.gameSet.update).toHaveBeenCalledWith({
      where: { setId: 1 },
      data: { setWinners: { set: [{ playerId: 2 }] } },
    });
    expect(db.match.deleteMany).toHaveBeenCalledWith({ where: { setId: 1 } });
    expect(db.playerStat.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ statId: 1, value: "1", gameId: 1 })],
    });
  });

  it("replaces every set when the set count changes", async () => {
    givenPendingEdit(mk8SessionForm([mk8Set(1, MARK), mk8Set(2, DES)]), { sets: true });

    expect(await approveEditRequest(5)).toEqual({ error: null });

    expect(db.gameSet.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 1 } });
    expect(db.gameSet.create).toHaveBeenCalledTimes(2);
  });

  it("loses cleanly when another reviewer claims the request first", async () => {
    givenPendingEdit({ ...mk8SessionForm(), sessionName: "Renamed" }, { sessionName: true });
    db.sessionEditRequest.updateMany.mockResolvedValueOnce({ count: 0 });

    expect(await approveEditRequest(5)).toEqual({ error: "Error: Edit request is not pending" });
    expect(db.session.update).not.toHaveBeenCalled();
    expect(db.sessionRevision.create).not.toHaveBeenCalled();
  });

  it("replaces every set when the count matches but the set ids do not", async () => {
    givenPendingEdit(mk8SessionForm([mk8Set(99, MARK)]), { sets: true });

    expect(await approveEditRequest(5)).toEqual({ error: null });

    expect(db.gameSet.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 1 } });
    expect(db.match.deleteMany).not.toHaveBeenCalled();
  });

  it("applies an edited date to the session and the recreated stats", async () => {
    const newDate = new Date("2025-06-15T00:00:00.000Z");
    givenPendingEdit({ ...mk8SessionForm(), date: newDate }, { date: true, sets: true });

    expect(await approveEditRequest(5)).toEqual({ error: null });

    expect(db.session.update).toHaveBeenCalledWith({
      where: { sessionId: 1 },
      data: { date: newDate },
    });
    expect(db.playerStat.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ date: newDate })],
    });
  });

  it("refuses requests that are no longer pending", async () => {
    givenPendingEdit(mk8SessionForm(), { sessionName: true }, "APPROVED");

    expect(await approveEditRequest(5)).toEqual({
      error: "Error: Edit request is not pending",
    });
    expect(db.session.update).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("reports a missing request", async () => {
    db.sessionEditRequest.findUnique.mockResolvedValue(null);

    expect(await approveEditRequest(404)).toEqual({ error: "Error: Edit request not found" });
  });
});

describe("rejectEditRequest", () => {
  it("marks a pending request rejected with the reviewer and note", async () => {
    expect(await rejectEditRequest(5, "Wrong video")).toEqual({ error: null });

    expect(db.sessionEditRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 5, status: "PENDING" },
      data: expect.objectContaining({
        status: "REJECTED",
        reviewerId: TEST_USERS.admin.id,
        reviewNote: "Wrong video",
      }),
    });
  });

  it("refuses to reject a request that was already reviewed", async () => {
    db.sessionEditRequest.updateMany.mockResolvedValueOnce({ count: 0 });

    expect(await rejectEditRequest(5)).toEqual({
      error: "Edit request not found or is not pending",
    });
  });
});
