import { formSchema, FormValues } from "./form-helpers";
import { StatName } from "@/lib/stat-names";
import { mk8SessionForm } from "@/test/fixtures";

const MIXED_CASE_VIDEO_ID = "dQw4w9WgXcQ";

const validSession = (sessionUrl: string): FormValues => ({
  game: "Call of Duty",
  sessionName: "Session Name",
  sessionUrl,
  thumbnail: "https://example.com/thumbnail.jpg",
  date: new Date("2023-10-01"),
  videoId: MIXED_CASE_VIDEO_ID,
  players: [{ playerId: 1, playerName: "Ben" }],
  dayWinners: [],
  sets: [
    {
      setId: 1,
      setWinners: [{ playerId: 1, playerName: "Ben" }],
      matches: [
        {
          matchWinners: [{ playerId: 1, playerName: "Ben" }],
          playerSessions: [
            {
              playerId: 1,
              playerStats: [
                { statId: 1, stat: StatName.COD_SCORE, statValue: "100" },
                { statId: 2, stat: StatName.COD_POS, statValue: "1" },
              ],
              playerSessionName: "Ben",
            },
          ],
        },
      ],
    },
  ],
});

describe("formSchema sessionUrl", () => {
  it("preserves mixed-case YouTube video IDs", () => {
    const url = `https://www.youtube.com/watch?v=${MIXED_CASE_VIDEO_ID}`;
    const parsed = formSchema.safeParse(validSession(url));

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.sessionUrl).toBe(url);
    expect(parsed.data.sessionUrl).toContain(MIXED_CASE_VIDEO_ID);
    expect(parsed.data.sessionUrl).not.toContain(MIXED_CASE_VIDEO_ID.toLowerCase());
  });

  it("accepts youtube.com without www without rewriting the video ID", () => {
    const url = `https://youtube.com/watch?v=${MIXED_CASE_VIDEO_ID}`;
    const parsed = formSchema.safeParse(validSession(url));

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.sessionUrl).toBe(url);
  });

  it("rejects non-YouTube URLs", () => {
    const parsed = formSchema.safeParse(
      validSession("https://example.com/watch?v=dQw4w9WgXcQ"),
    );

    expect(parsed.success).toBe(false);
  });
});

describe("formSchema dayWinners", () => {
  const url = `https://www.youtube.com/watch?v=${MIXED_CASE_VIDEO_ID}`;

  it("accepts an empty day winner list", () => {
    const parsed = formSchema.safeParse(validSession(url));

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.dayWinners).toEqual([]);
  });

  it("accepts day winners drawn from the session players", () => {
    const parsed = formSchema.safeParse({
      ...validSession(url),
      dayWinners: [{ playerId: 1, playerName: "Ben" }],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.dayWinners).toEqual([{ playerId: 1, playerName: "Ben" }]);
  });

  it("rejects a day winner who is not a session player", () => {
    const parsed = formSchema.safeParse({
      ...validSession(url),
      dayWinners: [{ playerId: 2, playerName: "Mark" }],
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0].path).toEqual(["dayWinners", 0]);
  });

  it("rejects a day winner that is not a known member", () => {
    const parsed = formSchema.safeParse({
      ...validSession(url),
      dayWinners: [{ playerId: 1, playerName: "Nobody" }],
    });

    expect(parsed.success).toBe(false);
  });
});

describe("formSchema statId", () => {
  const url = `https://www.youtube.com/watch?v=${MIXED_CASE_VIDEO_ID}`;

  it("accepts numeric ids from the create form and string ids from edit hydration", () => {
    const fromCreate = formSchema.safeParse(validSession(url));
    expect(fromCreate.success).toBe(true);
    if (fromCreate.success)
      expect(fromCreate.data.sets[0].matches[0].playerSessions[0].playerStats.map((s) => s.statId)).toEqual([1, 2]);

    const fromEdit = structuredClone(validSession(url));
    fromEdit.sets[0].matches[0].playerSessions[0].playerStats = fromEdit.sets[0].matches[0].playerSessions[0].playerStats.map(
      (stat) => ({ ...stat, statId: String(stat.statId) as never }),
    );
    const parsedEdit = formSchema.safeParse(fromEdit);
    expect(parsedEdit.success).toBe(true);
    if (parsedEdit.success)
      expect(parsedEdit.data.sets[0].matches[0].playerSessions[0].playerStats.map((s) => s.statId)).toEqual([1, 2]);

    const mk8Edit = mk8SessionForm();
    mk8Edit.sets[0].matches[0].playerSessions[0].playerStats[0].statId = "1" as never;
    const parsedMk8 = formSchema.safeParse(mk8Edit);
    expect(parsedMk8.success).toBe(true);
    if (parsedMk8.success)
      expect(parsedMk8.data.sets[0].matches[0].playerSessions[0].playerStats[0].statId).toBe(1);
  });

  it("rejects a missing or non-numeric stat id", () => {
    const missing = validSession(url);
    missing.sets[0].matches[0].playerSessions[0].playerStats[0] = {
      ...missing.sets[0].matches[0].playerSessions[0].playerStats[0],
      statId: "" as never,
    };
    expect(formSchema.safeParse(missing).success).toBe(false);

    const invalid = validSession(url);
    invalid.sets[0].matches[0].playerSessions[0].playerStats[0] = {
      ...invalid.sets[0].matches[0].playerSessions[0].playerStats[0],
      statId: "score" as never,
    };
    expect(formSchema.safeParse(invalid).success).toBe(false);
  });
});
