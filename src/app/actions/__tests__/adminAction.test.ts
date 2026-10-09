import { vi } from "vitest";
import { revalidateTag } from "next/cache";
import prisma from "prisma/db";
import { signInAs, TEST_USERS } from "@/test/session";
import { codSessionForm } from "@/test/fixtures";
import type { FormValues } from "@/app/(routes)/admin/_utils/form-helpers";
import {
  addGame,
  addGameStat,
  addPlayer,
  approveSession,
  insertNewSessionFromAdmin,
} from "../adminAction";

const db = vi.mocked(prisma, { deep: true });

const formData = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

beforeEach(() => signInAs("admin"));

describe("insertNewSessionFromAdmin", () => {
  beforeEach(() => {
    db.game.findFirst.mockResolvedValue({ gameId: 3 } as never);
    db.session.findFirst.mockResolvedValue(null);
    db.session.create.mockResolvedValue({ sessionId: 10 } as never);
    db.gameSet.create.mockResolvedValue({ setId: 20 } as never);
    db.match.create.mockResolvedValue({ matchId: 30 } as never);
    db.playerSession.create.mockResolvedValue({ playerSessionId: 40, playerId: 1 } as never);
    db.player.findUnique.mockResolvedValue({ playerId: 1, playerName: "Ben" } as never);
    db.gameStat.findMany.mockResolvedValue([
      { statId: 101, statName: "COD_SCORE" },
      { statId: 102, statName: "COD_POS" },
    ] as never);
  });

  it("writes the session tree and resolves stat names to the game's stat ids", async () => {
    expect(await insertNewSessionFromAdmin(codSessionForm())).toEqual({ error: null });

    expect(db.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gameId: 3,
        videoId: "video123456",
        createdBy: TEST_USERS.admin.email,
      }),
    });
    expect(db.gameSet.update).toHaveBeenCalledWith({
      where: { setId: 20 },
      data: { setWinners: { connect: [{ playerId: 1 }] } },
    });
    expect(db.match.create).toHaveBeenCalledWith({
      data: { setId: 20, matchWinners: { connect: [{ playerId: 1 }] } },
    });
    expect(db.playerStat.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ statId: 101, value: "100", playerSessionId: 40, gameId: 3 }),
        expect.objectContaining({ statId: 102, value: "1", playerSessionId: 40, gameId: 3 }),
      ],
    });
    expect(revalidateTag).toHaveBeenCalledWith("getAllSessions", "max");
    expect(revalidateTag).toHaveBeenCalledWith("getMember", "max");
  });

  it("keeps the case of YouTube video ids in the stored session url", async () => {
    const sessionUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    await insertNewSessionFromAdmin({ ...codSessionForm(), sessionUrl, videoId: "dQw4w9WgXcQ" });

    expect(db.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessionUrl, videoId: "dQw4w9WgXcQ" }),
    });
  });

  it("rejects submissions that fail the form schema before touching the database", async () => {
    const result = await insertNewSessionFromAdmin({
      ...codSessionForm(),
      sessionUrl: "https://evil.example.com/watch?v=video123456",
    });

    expect(result).toEqual({ error: "Invalid session data. Please review the form." });
    expect(db.game.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ["no sets", (form: FormValues) => ({ ...form, sets: [] })],
    ["a set with no matches", (form: FormValues) => ({ ...form, sets: [{ ...form.sets[0], matches: [] }] })],
  ])("rejects a submission with %s", async (_label, mutate) => {
    const result = await insertNewSessionFromAdmin(mutate(codSessionForm()) as FormValues);

    expect(result).toEqual({ error: "Invalid session data. Please review the form." });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an unknown game", async () => {
    db.game.findFirst.mockResolvedValue(null);

    expect(await insertNewSessionFromAdmin(codSessionForm())).toEqual({ error: "Game not found." });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a video that was already submitted for the game", async () => {
    db.session.findFirst.mockResolvedValue({ sessionId: 99 } as never);

    expect(await insertNewSessionFromAdmin(codSessionForm())).toEqual({
      error: "Video already exists.",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("returns a generic error and skips revalidation when the transaction fails", async () => {
    db.player.findUnique.mockResolvedValue(null);

    expect(await insertNewSessionFromAdmin(codSessionForm())).toEqual({
      error: "Unknown error occurred. Please try again.",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("fails rather than writing a stat the game does not define", async () => {
    db.gameStat.findMany.mockResolvedValue([{ statId: 101, statName: "COD_SCORE" }] as never);
    db.gameStat.findFirst.mockResolvedValue(null);

    expect((await insertNewSessionFromAdmin(codSessionForm())).error).not.toBeNull();
    expect(db.playerStat.createMany).not.toHaveBeenCalled();
  });
});

describe("approveSession", () => {
  it("only approves sessions that are still pending", async () => {
    expect(await approveSession(7)).toEqual({ error: null });

    expect(db.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: 7, isApproved: false },
        data: { isApproved: true },
      }),
    );
    expect(revalidateTag).toHaveBeenCalledWith("getAllSessions", "max");
  });

  it("surfaces a database failure", async () => {
    db.session.update.mockRejectedValue(new Error("Record not found"));

    expect(await approveSession(7)).toEqual({ error: "Record not found" });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe("catalog actions", () => {
  it("addGame requires a name and revalidates games", async () => {
    expect(await addGame(formData({}))).toEqual({ error: "Game name is required." });
    expect(db.game.create).not.toHaveBeenCalled();

    expect(await addGame(formData({ gameName: "Halo" }))).toEqual({ error: null });
    expect(db.game.create).toHaveBeenCalledWith({ data: { gameName: "Halo" } });
    expect(revalidateTag).toHaveBeenCalledWith("getAllGames", "max");
  });

  it("addPlayer requires a name and revalidates members", async () => {
    expect(await addPlayer(formData({}))).toEqual({ error: "Player name is required." });
    expect(db.player.create).not.toHaveBeenCalled();

    expect(await addPlayer(formData({ playerName: "Ipi" }))).toEqual({ error: null });
    expect(db.player.create).toHaveBeenCalledWith({ data: { playerName: "Ipi" } });
    expect(revalidateTag).toHaveBeenCalledWith("getAllMembers", "max");
  });

  it("addGameStat requires every field and coerces unknown types to STRING", async () => {
    expect(await addGameStat(formData({ statName: "HALO_KILLS", type: "INT" }))).toEqual({
      error: "Missing required fields.",
    });
    expect(db.gameStat.create).not.toHaveBeenCalled();

    await addGameStat(formData({ statName: "HALO_MAP", gameId: "4", type: "TEXT" }));
    expect(db.gameStat.create).toHaveBeenCalledWith({
      data: { statName: "HALO_MAP", gameId: 4, type: "STRING" },
    });
    expect(revalidateTag).toHaveBeenCalledWith("getAllGameStats", "max");
  });
});
