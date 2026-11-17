import { vi } from "vitest";
import { insertNewSessionFromAdmin } from "@/app/actions/adminAction";
import { createSessionEditRequest } from "@/app/actions/editSession";
import { codSessionForm, mk8SessionForm } from "@/test/fixtures";
import { formSchema } from "./form-helpers";
import { draftKey, readDraft, saveDraft } from "./session-draft";
import { sessionToFormValues } from "./session-to-form";
import { submitSession } from "./submit-session";
import { visionResultToMatch } from "./vision-to-match";

vi.mock("@/app/actions/adminAction", () => ({ insertNewSessionFromAdmin: vi.fn() }));
vi.mock("@/app/actions/editSession", () => ({ createSessionEditRequest: vi.fn() }));

const MARK = { playerId: 1, playerName: "Mark" };
const DYLAN = { playerId: 2, playerName: "Dylan" };
const BEN = { playerId: 3, playerName: "Ben" };

describe("sessionToFormValues", () => {
  type Stored = Parameters<typeof sessionToFormValues>[0];
  const plays = (player: typeof MARK, position: string) => ({
    player,
    playerStats: [{ value: position, gameStat: { statId: 1, statName: "MK8_POS", type: "INT" } }],
  });
  const stored = {
    sessionId: 7,
    Game: { gameName: "Mario Kart 8" },
    sessionName: "MK8 Night",
    sessionUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    videoId: "dQw4w9WgXcQ",
    date: new Date("2025-01-01"),
    dayWinners: [BEN],
    sets: [
      {
        setId: 11,
        setWinners: [MARK],
        matches: [
          { matchWinners: [MARK], playerSessions: [plays(MARK, "1"), plays(DYLAN, "2")] },
          { matchWinners: [BEN], playerSessions: [plays(BEN, "1"), plays(MARK, "3")] },
        ],
      },
    ],
  } as unknown as Stored;

  it("maps a stored session onto the form, keeping its id", () => {
    const values = sessionToFormValues(stored);

    expect(values).toMatchObject({
      sessionId: 7,
      game: "Mario Kart 8",
      sessionName: "MK8 Night",
      dayWinners: [BEN],
    });
    expect(values.sets[0]).toEqual({
      setId: 11,
      setWinners: [MARK],
      matches: [
        {
          matchWinners: [MARK],
          playerSessions: [
            { playerId: 1, playerSessionName: "Mark", playerStats: [{ statId: 1, stat: "MK8_POS", statValue: "1" }] },
            { playerId: 2, playerSessionName: "Dylan", playerStats: [{ statId: 1, stat: "MK8_POS", statValue: "2" }] },
          ],
        },
        expect.objectContaining({ matchWinners: [BEN] }),
      ],
    });
  });

  it("lists everyone who played any match as a session player, once", () => {
    // Ben sat out the first match but won the day.
    expect(sessionToFormValues(stored).players).toEqual([MARK, DYLAN, BEN]);
  });

  it("produces values the form schema accepts unchanged", () => {
    const values = sessionToFormValues(stored);

    expect(formSchema.parse(values)).toEqual(values);
  });
});

describe("visionResultToMatch", () => {
  const stats = [{ statId: 1, stat: "MK8_POS", statValue: "2" }];

  it("turns imported players and winners into a match", () => {
    const mark = { playerId: 1, name: "Mark", stats };

    expect(visionResultToMatch([mark], [mark])).toEqual({
      matchWinners: [MARK],
      playerSessions: [{ playerId: 1, playerSessionName: "Mark", playerStats: stats }],
    });
  });

  it("leaves the winners empty when the import named none", () => {
    expect(visionResultToMatch([{ playerId: 1, name: "Mark", stats }]).matchWinners).toEqual([]);
  });

  it("gives a row the import could not identify id 0, which the form rejects", () => {
    const match = visionResultToMatch([{ name: "", stats }]);

    expect(match.playerSessions[0]).toMatchObject({ playerId: 0, playerSessionName: "Unknown Player" });
  });
});

describe("session drafts", () => {
  const fakeStorage = () => {
    const items = new Map<string, string>();
    return {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    } as Storage;
  };

  it("keeps the new-session draft and each edited session's draft apart", () => {
    expect(draftKey("create")).toBe("entryCreatorForm");
    expect(draftKey("edit", 7)).toBe("entryCreatorForm:edit:7");
    expect(draftKey("edit", 8)).not.toBe(draftKey("edit", 7));
  });

  it("round-trips a form, reviving the date", () => {
    const storage = fakeStorage();
    const form = codSessionForm();

    saveDraft(storage, "draft", form);

    expect(readDraft(storage, "draft")).toEqual(form);
    expect(readDraft(storage, "draft")?.date).toBeInstanceOf(Date);
  });

  it("gives a draft saved before day winners existed an empty list", () => {
    const storage = fakeStorage();
    const legacy: Partial<ReturnType<typeof codSessionForm>> = codSessionForm();
    delete legacy.dayWinners;
    storage.setItem("draft", JSON.stringify(legacy));

    expect(readDraft(storage, "draft")?.dayWinners).toEqual([]);
  });

  it.each([
    ["there is no draft", null],
    ["the draft is not valid JSON", "{nope"],
  ])("returns null when %s", (_label, saved) => {
    const storage = fakeStorage();
    if (saved) storage.setItem("draft", saved);

    expect(readDraft(storage, "draft")).toBeNull();
  });
});

describe("submitSession", () => {
  it("inserts a new session and passes back the server's answer", async () => {
    vi.mocked(insertNewSessionFromAdmin).mockResolvedValue({ error: "Video already exists." });
    const form = codSessionForm();

    expect(await submitSession("create", form, { dirtyFields: {} })).toBe("Video already exists.");
    expect(insertNewSessionFromAdmin).toHaveBeenCalledWith(form);
    expect(createSessionEditRequest).not.toHaveBeenCalled();
  });

  it("turns an edit into a request carrying what changed", async () => {
    vi.mocked(createSessionEditRequest).mockResolvedValue({ error: null });
    const form = mk8SessionForm();
    const dirtyFields = { sessionName: true };

    expect(await submitSession("edit", form, { sessionId: 7, dirtyFields })).toBeNull();
    expect(createSessionEditRequest).toHaveBeenCalledWith(7, form, dirtyFields);
    expect(insertNewSessionFromAdmin).not.toHaveBeenCalled();
  });

  it("refuses an edit with no session to edit", async () => {
    expect(await submitSession("edit", mk8SessionForm(), { dirtyFields: {} })).toBe(
      "Session ID is required for editing",
    );
    expect(createSessionEditRequest).not.toHaveBeenCalled();
  });
});
