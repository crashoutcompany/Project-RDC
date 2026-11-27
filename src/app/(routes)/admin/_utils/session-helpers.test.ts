import { vi } from "vitest";
import { insertNewSessionFromAdmin } from "@/app/actions/adminAction";
import { createSessionEditRequest } from "@/app/actions/editSession";
import { codSessionForm, mk8Set, mk8SessionForm } from "@/test/fixtures";
import { formSchema } from "./form-helpers";
import { applyDraft, draftKey, readDraft, saveDraft } from "./session-draft";
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

  it("round-trips a form and its base, reviving the dates", () => {
    const storage = fakeStorage();
    const form = codSessionForm();
    const base = { ...codSessionForm(), sessionName: "Before" };

    saveDraft(storage, "draft", form, base);

    expect(readDraft(storage, "draft")).toEqual({ values: form, base });
    expect(readDraft(storage, "draft")?.values.date).toBeInstanceOf(Date);
    expect(readDraft(storage, "draft")?.base?.date).toBeInstanceOf(Date);
  });

  it("reads a draft saved as bare form values, with no base", () => {
    const storage = fakeStorage();
    storage.setItem("draft", JSON.stringify(codSessionForm()));

    expect(readDraft(storage, "draft")).toEqual({ values: codSessionForm(), base: null });
  });

  it("gives a draft saved before day winners existed an empty list", () => {
    const storage = fakeStorage();
    const legacy: Partial<ReturnType<typeof codSessionForm>> = codSessionForm();
    delete legacy.dayWinners;
    storage.setItem("draft", JSON.stringify(legacy));

    expect(readDraft(storage, "draft")?.values.dayWinners).toEqual([]);
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

describe("applyDraft", () => {
  const MARK_P = { playerId: 1, playerName: "Mark" };
  const DES_P = { playerId: 2, playerName: "Des" };
  const [set1, set2] = [mk8Set(1, MARK_P), mk8Set(2, MARK_P)];
  const base = () => mk8SessionForm([structuredClone(set1), structuredClone(set2)]);
  const draftOf = (edit: (form: ReturnType<typeof base>) => void) => {
    const values = base();
    edit(values);
    return { values, base: base() };
  };
  const mk8Race = (winner: typeof MARK_P) => mk8Set(1, winner).matches[0];
  const twoRaces = (setId: number, race1: typeof MARK_P, race2: typeof MARK_P) => ({
    setId,
    setWinners: [race1],
    matches: [mk8Race(race1), mk8Race(race2)],
  });

  it("applies only what the admin changed, so a newer edit is not reverted", () => {
    // The session was renamed and set 2 re-scored by a newer approved edit.
    const current = base();
    current.sessionName = "Renamed by someone else";
    current.sets[1] = mk8Set(2, DES_P);
    // The draft changed only the session URL.
    const draft = draftOf((f) => (f.sessionUrl = "https://www.youtube.com/watch?v=new"));

    const result = applyDraft(current, draft);

    expect(result?.dropped).toBe(0);
    expect(result?.values).toEqual({
      ...current,
      sessionUrl: "https://www.youtube.com/watch?v=new",
    });
  });

  it("changes only the set the admin edited", () => {
    const current = base();
    current.sets[0] = mk8Set(1, DES_P); // newer edit to set 1
    const draft = draftOf((f) => (f.sets[1] = mk8Set(2, DES_P)));

    const result = applyDraft(current, draft);

    expect(result?.values.sets).toEqual([mk8Set(1, DES_P), mk8Set(2, DES_P)]);
  });

  it("restores only the match the admin edited, not a sibling a newer edit changed", () => {
    // One MK8 set, two races: a restored draft of race 1 must not revert race 2.
    const races = () => mk8SessionForm([twoRaces(1, MARK_P, MARK_P)]);
    const current = races();
    current.sets[0].matches[1] = mk8Race(DES_P); // newer approved edit to race 2
    const values = races();
    values.sets[0].matches[0] = mk8Race(DES_P); // admin's unfinished edit to race 1

    const result = applyDraft(current, { values, base: races() });

    expect(result?.values.sets[0].matches).toEqual([
      mk8Race(DES_P),
      mk8Race(DES_P),
    ]);
    expect(result?.values.sets[0].setWinners).toEqual([MARK_P]);
  });

  it("keeps a newer set-winner change when the admin only edited a match", () => {
    const races = () => mk8SessionForm([twoRaces(1, MARK_P, MARK_P)]);
    const current = races();
    current.sets[0].setWinners = [DES_P];
    const values = races();
    values.sets[0].matches[0] = mk8Race(DES_P);

    const result = applyDraft(current, { values, base: races() });

    expect(result?.values.sets[0].setWinners).toEqual([DES_P]);
    expect(result?.values.sets[0].matches[0]).toEqual(mk8Race(DES_P));
    expect(result?.values.sets[0].matches[1]).toEqual(mk8Race(MARK_P));
  });

  it("uses the whole draft set when the admin added or removed a match", () => {
    const races = () => mk8SessionForm([twoRaces(1, MARK_P, MARK_P)]);
    const current = races();
    current.sets[0].matches[1] = mk8Race(DES_P); // newer edit to race 2
    const values = races();
    values.sets[0].matches.push(mk8Race(DES_P)); // admin added race 3

    const result = applyDraft(current, { values, base: races() });

    expect(result?.values.sets[0].matches).toEqual(values.sets[0].matches);
  });

  it("lets the draft win where the admin and a newer edit changed the same field", () => {
    const current = { ...base(), sessionName: "Newer name" };
    const draft = draftOf((f) => (f.sessionName = "Admin name"));

    expect(applyDraft(current, draft)?.values.sessionName).toBe("Admin name");
  });

  it("does not treat key order or an untouched date as a change", () => {
    const current = { ...base(), sessionName: "Newer name" };
    const values = base();
    // Same content, keys in another order.
    const reordered = Object.fromEntries(Object.entries(values).reverse()) as typeof values;

    expect(applyDraft(current, { values: reordered, base: base() })?.values).toEqual(current);
  });

  it("removes a set the admin deleted, and keeps the rest", () => {
    const draft = draftOf((f) => f.sets.splice(0, 1));

    expect(applyDraft(base(), draft)?.values.sets).toEqual([set2]);
  });

  it("adds a set the admin created, renumbering it if its id is now taken", () => {
    const current = base();
    current.sets.push(mk8Set(3, MARK_P)); // a newer edit already used id 3
    const draft = draftOf((f) => f.sets.push(mk8Set(3, DES_P)));

    const sets = applyDraft(current, draft)?.values.sets;

    expect(sets).toHaveLength(4);
    expect(sets?.[2]).toEqual(mk8Set(3, MARK_P));
    expect(sets?.[3]).toEqual(mk8Set(4, DES_P));
  });

  it("counts edits to a set that no longer exists instead of resurrecting it", () => {
    const current = base();
    current.sets = [mk8Set(10, MARK_P), mk8Set(11, MARK_P)]; // sets were replaced
    const draft = draftOf((f) => (f.sets[0] = mk8Set(1, DES_P)));

    const result = applyDraft(current, draft);

    expect(result?.dropped).toBe(1);
    expect(result?.values.sets).toEqual(current.sets);
  });

  it("restores a draft with no base as-is for a new session", () => {
    const values = codSessionForm();
    const blank = { ...codSessionForm(), sessionId: undefined };

    expect(applyDraft(blank, { values, base: null })).toEqual({ values, dropped: 0 });
  });

  it("refuses a base-less draft for an existing session", () => {
    expect(applyDraft(base(), { values: base(), base: null })).toBeNull();
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
