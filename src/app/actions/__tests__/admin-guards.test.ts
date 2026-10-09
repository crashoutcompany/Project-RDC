import { vi } from "vitest";

vi.mock("@/app/actions/visionAction", () => ({ analyzeScreenShot: vi.fn() }));

import prisma, { handlePrismaOperation } from "prisma/db";
import { errorCodes } from "@/lib/constants";
import { signInAs } from "@/test/session";
import { codSessionForm } from "@/test/fixtures";
import { analyzeScreenShot } from "@/app/actions/visionAction";
import { getRDCVideoDetails } from "../action";
import {
  addGame,
  addGameStat,
  addPlayer,
  approveSession,
  getGameStats,
  insertNewSessionFromAdmin,
} from "../adminAction";
import {
  approveEditRequest,
  createSessionEditRequest,
  listPendingEdits,
  rejectEditRequest,
} from "../editSession";
import { handleAnalyzeBtnClick } from "@/app/(routes)/admin/_utils/rdc-vision-helpers";
import type { Player } from "@/generated/prisma/client";

const formData = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

/** Every admin-only server action, invoked with otherwise-valid input. */
const adminActions: [string, () => Promise<unknown>][] = [
  ["approveSession", () => approveSession(1)],
  ["getGameStats", () => getGameStats("Call of Duty")],
  ["insertNewSessionFromAdmin", () => insertNewSessionFromAdmin(codSessionForm())],
  ["addGame", () => addGame(formData({ gameName: "Halo" }))],
  ["addPlayer", () => addPlayer(formData({ playerName: "Ipi" }))],
  [
    "addGameStat",
    () => addGameStat(formData({ statName: "HALO_KILLS", gameId: "1", type: "INT" })),
  ],
  [
    "createSessionEditRequest",
    () => createSessionEditRequest(1, codSessionForm(), { sessionName: true }),
  ],
  ["listPendingEdits", () => listPendingEdits()],
  ["approveEditRequest", () => approveEditRequest(1)],
  ["rejectEditRequest", () => rejectEditRequest(1)],
  ["getRDCVideoDetails", () => getRDCVideoDetails("dQw4w9WgXcQ", "Call of Duty", "anon")],
  [
    "handleAnalyzeBtnClick",
    () =>
      handleAnalyzeBtnClick(
        "base64",
        [{ playerId: 1, playerName: "Ben" }] as Player[],
        "Mario Kart 8",
      ),
  ],
];

/** Pulls the denial message out of each action's result shape. */
const denialOf = (result: unknown) => {
  const r = result as { error?: string; message?: string };
  return r.error ?? r.message;
};

const wasCalled = (fn: unknown) => vi.mocked(fn as () => unknown).mock.calls.length > 0;

const prismaWasTouched = () =>
  wasCalled(handlePrismaOperation) ||
  Object.values(prisma).some((model) =>
    typeof model === "function" ? wasCalled(model) : Object.values(model).some(wasCalled),
  );

describe.each([
  ["signed-out visitor", null],
  ["non-admin user", "user"],
] as const)("admin actions reject a %s", (_label, role) => {
  beforeEach(() => signInAs(role));

  it.each(adminActions)("%s", async (_name, run) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(denialOf(await run())).toBe(errorCodes.NotAuthenticated);
    expect(prismaWasTouched()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(analyzeScreenShot).not.toHaveBeenCalled();
  });
});
