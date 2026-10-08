import { formSchema, FormValues } from "../(routes)/admin/_utils/form-helpers";
import { StatName } from "@/lib/stat-names";

const MIXED_CASE_VIDEO_ID = "dQw4w9WgXcQ";

const validSession = (sessionUrl: string): FormValues => ({
  game: "Call of Duty",
  sessionName: "Session Name",
  sessionUrl,
  thumbnail: "https://example.com/thumbnail.jpg",
  date: new Date("2023-10-01"),
  videoId: MIXED_CASE_VIDEO_ID,
  players: [{ playerId: 1, playerName: "Ben" }],
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
                { statId: "1", stat: StatName.COD_SCORE, statValue: "100" },
                { statId: "2", stat: StatName.COD_POS, statValue: "1" },
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
